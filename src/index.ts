import { createLogger } from "./lib/logger.js";
import { validateEnv } from "./lib/envValidator.js";
import { CodeAgent } from "./agents/codeAgent.js";
import { OpsAgent } from "./agents/opsAgent.js";
import { CallerModel } from "./caller/callerModel.js";
import { SQLiteEventBus } from "./events/sqliteBus.js";
import { InterfaceController } from "./interface/controller.js";
import { LatencyTracker } from "./metrics/latencyTracker.js";
import { createModelProvider } from "./models/provider.js";
import { MissionControlServer } from "./missionControl/server.js";
import { ClawdeckCompatStore } from "./missionControl/clawdeckCompatStore.js";
import { runLocalAdapter } from "./mock/localAdapter.js";
import { Orchestrator } from "./orchestrator/orchestrator.js";
import { SQLiteTaskStore } from "./storage/sqliteTaskStore.js";
import { SQLiteTraceStore } from "./trace/sqliteTraceStore.js";
import { SQLiteSessionTranscriptStore } from "./transcript/sqliteSessionTranscriptStore.js";
import { SQLiteNotificationStore } from "./notifications/sqliteNotificationStore.js";
import { MultiAgentRuntime } from "./pipeline/agentRuntime.js";
import { registerOutreachAgents } from "./agents/outreach/index.js";
import { DecisionStore } from "./learning/decisionStore.js";
import { withLearning } from "./learning/learningAgent.js";
import { OutcomeIngester } from "./learning/outcomeIngest.js";
import { SupabaseOutcomePoller } from "./learning/supabaseOutcomePoller.js";
import { EpisodicStore } from "./memory/episodicStore.js";
import { HeuristicCritic } from "./evaluation/heuristicCritic.js";
import { ReflectionLoop } from "./evaluation/reflectionLoop.js";
import { CriticFactory, type CriticImplementation } from "./evaluation/criticFactory.js";
import { AgentCapabilityRegistry } from "./runtime/agentRegistry.js";
import { AttributionEngine } from "./evaluation/attributionEngine.js";
import { StrategicStore } from "./memory/strategicStore.js";
import { PipelineEngine } from "./pipeline/engine.js";
import { PipelineScheduler } from "./pipeline/scheduler.js";
import { SQLitePipelineStore } from "./pipeline/sqlitePipelineStore.js";

const log = createLogger("main");

// Track all closeable resources for graceful shutdown
const closeables: Array<{ close(): void }> = [];

async function main(): Promise<void> {
  const mode = process.env.INTERFACE_MODE ?? "local";
  validateEnv(mode);

  const changelogChangeId =
    process.env.BUILD_CHANGE_ID ?? "2026-03-07_054_planner-auth-bootstrap-fix";
  const buildVersion = "0.1.0";
  const dbPath = process.env.DB_PATH ?? "data/mvp.sqlite";

  // ── Persistent event bus ──
  const bus = new SQLiteEventBus(dbPath);
  closeables.push(bus);

  const latencyTracker = new LatencyTracker();
  const modelProvider = createModelProvider();

  // ── Storage layer ──
  const taskStore = new SQLiteTaskStore(dbPath);
  closeables.push(taskStore);
  const transcriptStore = new SQLiteSessionTranscriptStore(dbPath);
  closeables.push(transcriptStore);
  const notificationStore = new SQLiteNotificationStore(dbPath);
  closeables.push(notificationStore);
  const pipelineStore = new SQLitePipelineStore(dbPath);
  closeables.push(pipelineStore);
  const compatStore = new ClawdeckCompatStore(dbPath);
  const traceStore = new SQLiteTraceStore({
    dbPath,
    buildVersion,
    changelogChangeId,
  });
  closeables.push(traceStore);

  // ── Orchestrator ──
  const orchestrator = new Orchestrator(
    taskStore,
    bus,
    new CodeAgent(modelProvider),
    new OpsAgent(modelProvider),
    traceStore,
  );

  const controller = new InterfaceController(
    orchestrator,
    new CallerModel(modelProvider),
    changelogChangeId,
    latencyTracker,
  );

  bus.subscribe("task.created", (event) => {
    log.info("task created", { task: event.payload });
  });

  // Replay any events from a previous interrupted run
  await bus.replayUnprocessed();

  // ── Self-learning layer ──
  const decisionStore = new DecisionStore(dbPath);
  closeables.push(decisionStore);

  // ── Episodic memory (per-run history with critic scores + outcomes) ──
  const episodicStore = new EpisodicStore(dbPath);
  closeables.push(episodicStore);

  // ── Strategic memory (cross-run knowledge, populated by nightly ranker) ──
  const strategicStore = new StrategicStore(dbPath);
  closeables.push(strategicStore);

  // ── Pipeline runtime + capability registry ──
  // Created early so the reflection loop can derive its enabled set from it.
  const agentRuntime = new MultiAgentRuntime();
  const agentRegistry = new AgentCapabilityRegistry(agentRuntime);
  registerOutreachAgents(agentRuntime, agentRegistry);

  // Wrap all registered agents with self-learning decision logging
  for (const agentId of agentRuntime.listRegistered()) {
    const original = agentRuntime.getHandler(agentId);
    if (original) {
      agentRuntime.register(
        agentId,
        withLearning(agentId, original, decisionStore),
      );
    }
  }
  log.info("agents registered with learning", {
    agents: agentRuntime.listRegistered(),
    count: agentRuntime.listRegistered().length,
    capabilities: agentRegistry.list().length,
  });

  // ── Critic + reflection ──
  // Reflection-enabled agents derived from the capability registry. The env
  // override remains useful for ops emergencies (force-disable a noisy agent).
  // CriticFactory dispatches per-agent — heuristic by default, llm when the
  // agent's registry entry sets critic_implementation: "llm".
  const defaultImpl =
    (process.env.CRITIC_IMPLEMENTATION as CriticImplementation | undefined) ?? "heuristic";
  const critic =
    defaultImpl === "heuristic" && process.env.CRITIC_FORCE_HEURISTIC === "true"
      ? new HeuristicCritic()
      : new CriticFactory(agentRegistry, { defaultImplementation: defaultImpl });
  const envOverride = process.env.CRITIC_ENABLED_AGENTS;
  const enabledFromEnv = envOverride
    ? new Set(envOverride.split(",").map((s) => s.trim()).filter(Boolean))
    : undefined;
  const reflectionLoop = new ReflectionLoop(
    critic,
    {
      threshold: Number(process.env.CRITIC_THRESHOLD ?? "0.7"),
      maxRetries: Number(process.env.CRITIC_MAX_RETRIES ?? "1"),
      enabledAgents: enabledFromEnv ?? agentRegistry.reflectionEnabledIds(),
    },
    episodicStore,
  );

  // ── Attribution + Outcome ingest (cross-system pitch result bridge) ──
  const attributionEngine = new AttributionEngine(decisionStore, episodicStore);
  const outcomeIngester = new OutcomeIngester(
    decisionStore,
    episodicStore,
    attributionEngine,
  );
  const outcomePoller = new SupabaseOutcomePoller(decisionStore, outcomeIngester);
  const pipelineEngine = new PipelineEngine(
    pipelineStore,
    agentRuntime,
    notificationStore,
    undefined, // budgetPolicy — keep default
    undefined, // dispatchAdapters
    episodicStore,
    reflectionLoop,
    decisionStore,
  );

  // Auto-register pipeline definitions
  if (!pipelineStore.getDefinition("lead-generation-v1")) {
    pipelineEngine.createLeadGenerationDefinition();
    log.info("registered pipeline: lead-generation-v1");
  }
  if (!pipelineStore.getDefinition("site-generation-v1")) {
    pipelineEngine.createSiteGenerationDefinition();
    log.info("registered pipeline: site-generation-v1");
  }

  // Recover stale runs from previous crash
  pipelineEngine.recoverStaleRuns();

  const pipelineScheduler = new PipelineScheduler(pipelineStore, pipelineEngine);

  // ── Mode dispatch ──
  if (mode === "local") {
    await runLocalAdapter(controller);
    return;
  }


  if (mode === "mission-control") {
    const schedulerMode = process.env.SCHEDULER_MODE ?? "disabled";
    if (schedulerMode === "internal") {
      pipelineScheduler.start();
      log.info("scheduler started", { mode: "internal" });
    } else if (["disabled", "off", "none"].includes(schedulerMode)) {
      log.info("scheduler disabled");
    } else {
      log.warn("unknown SCHEDULER_MODE, defaulting to disabled", { schedulerMode });
    }
    const server = new MissionControlServer(
      taskStore,
      traceStore,
      controller,
      latencyTracker,
      transcriptStore,
      notificationStore,
      undefined, // realtimeSessionBroker — removed
      pipelineStore,
      pipelineEngine,
      undefined, // telephonyClient — removed
      compatStore,
      outcomeIngester,
      decisionStore,
    );
    const host = process.env.MISSION_CONTROL_HOST ?? "127.0.0.1";
    const port = Number(process.env.MISSION_CONTROL_PORT ?? "4317");
    await server.start({ host, port });

    // Start the Supabase backstop poller. Skipped silently when
    // SUPABASE_URL / service-role key are absent (logged once on first poll).
    if (process.env.OUTCOME_POLLER_DISABLED !== "true") {
      outcomePoller.start();
    }

    // ── Graceful shutdown ──
    const shutdown = async (signal: string): Promise<void> => {
      log.info(`received ${signal}, shutting down`);
      pipelineScheduler.stop();
      outcomePoller.stop();
      await server.stop();
      for (const c of closeables) {
        try {
          c.close();
        } catch {
          // already closed
        }
      }
      log.info("shutdown complete");
      process.exit(0);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
    return;
  }

  throw new Error(`Unsupported INTERFACE_MODE: ${mode}`);
}

main().catch((error) => {
  log.error("fatal startup error", { error: String(error) });
  process.exit(1);
});
