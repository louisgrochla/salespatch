import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { createLogger } from "../lib/logger.js";
import { authenticateRequest } from "./authMiddleware.js";
import { RateLimiter } from "../lib/rateLimiter.js";
import { ValidationError } from "../lib/validate.js";
import { InterfaceController } from "../interface/controller.js";
import { LatencyTracker } from "../metrics/latencyTracker.js";
import { TaskStore } from "../storage/taskStore.js";
import { TraceStore } from "../trace/traceStore.js";
import { SessionTranscriptStore } from "../transcript/sessionTranscriptStore.js";
import {
  NotificationFilter,
  NotificationRecord,
  NotificationStore,
} from "../notifications/notificationStore.js";
import { RealtimeSessionBroker } from "../openclaw/realtimeSessionBroker.js";
import { PipelineEngine } from "../pipeline/engine.js";
import { SQLitePipelineStore } from "../pipeline/sqlitePipelineStore.js";
import { PipelineDefinition } from "../pipeline/types.js";
import { TelephonyControlClient } from "../telephony/controlClient.js";
import { ClawdeckCompatStore } from "./clawdeckCompatStore.js";
import { OutcomeIngester } from "../learning/outcomeIngest.js";
import { DecisionStore } from "../learning/decisionStore.js";
import { handleOutcomesRoute } from "./routes/outcomes.js";
import { handleDecisionsRoute } from "./routes/decisions.js";

const log = createLogger("mission-control");
const MAX_BODY_BYTES = 1_048_576; // 1MB

interface MissionControlServerOptions {
  host: string;
  port: number;
}

export class MissionControlServer {
  private server?: ReturnType<typeof createServer>;
  private readonly rateLimiter = new RateLimiter();
  private readonly apiToken = process.env.MISSION_CONTROL_API_TOKEN;
  private readonly corsOrigin = process.env.MISSION_CONTROL_CORS_ORIGIN ?? "*";
  private readonly startedAt = Date.now();

  constructor(
    private readonly taskStore: TaskStore,
    private readonly traceStore: TraceStore,
    private readonly controller: InterfaceController,
    private readonly latencyTracker: LatencyTracker,
    private readonly transcriptStore?: SessionTranscriptStore,
    private readonly notificationStore?: NotificationStore,
    private readonly realtimeSessionBroker?: RealtimeSessionBroker,
    private readonly pipelineStore?: SQLitePipelineStore,
    private readonly pipelineEngine?: PipelineEngine,
    private readonly telephonyClient?: TelephonyControlClient,
    private readonly compatStore?: ClawdeckCompatStore,
    private readonly outcomeIngester?: OutcomeIngester,
    private readonly decisionStore?: DecisionStore,
  ) {}

  start(options: MissionControlServerOptions): Promise<void> {
    this.server = createServer(async (req, res) => {
      try {
        await this.route(req, res);
      } catch (error) {
        if (error instanceof ValidationError) {
          this.sendJson(res, error.statusCode, { error: error.message });
        } else {
          log.error("unhandled route error", { error: String(error), url: req.url });
          this.sendJson(res, 500, { error: "Internal server error" });
        }
      }
    });

    return new Promise((resolve) => {
      this.server?.listen(options.port, options.host, () => {
        log.info(`listening at http://${options.host}:${options.port}`);
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    if (!this.server) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      this.server?.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  private async route(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const method = req.method ?? "GET";
    const url = new URL(req.url ?? "/", "http://localhost");

    // ── CORS ──
    res.setHeader("Access-Control-Allow-Origin", this.corsOrigin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // ── Rate limiting ──
    const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
      ?? req.socket.remoteAddress ?? "unknown";
    if (!this.rateLimiter.isAllowed(clientIp)) {
      this.sendJson(res, 429, { error: "Too many requests" });
      return;
    }

    // ── Auth ──
    const auth = authenticateRequest(req, this.apiToken);
    if (!auth.ok) {
      this.sendJson(res, 401, { error: auth.error });
      return;
    }

    if (method === "GET" && url.pathname === "/api/health") {
      this.sendJson(res, 200, {
        status: "ok",
        uptime_seconds: Math.floor((Date.now() - this.startedAt) / 1000),
        build_version: "0.1.0",
      });
      return;
    }

    // ── Outcome ingest + listing ──
    if (this.outcomeIngester && url.pathname.startsWith("/api/outcomes/")) {
      const handled = await handleOutcomesRoute(req, res, url, {
        ingester: this.outcomeIngester,
        ingestSecret: process.env.OUTCOME_INGEST_SECRET,
        allowUnsigned:
          process.env.NODE_ENV !== "production" &&
          process.env.OUTCOME_INGEST_ALLOW_UNSIGNED === "true",
      });
      if (handled) return;
    }

    // ── Manual decisions (manual /build-demo skill, admin tools) ──
    if (this.decisionStore && url.pathname.startsWith("/api/decisions/")) {
      const handled = await handleDecisionsRoute(req, res, url, {
        decisionStore: this.decisionStore,
      });
      if (handled) return;
    }

    if (method === "GET" && url.pathname === "/api/metrics") {
      this.sendJson(res, 200, this.latencyTracker.snapshot());
      return;
    }

    if (method === "GET" && url.pathname === "/api/dashboard") {
      const tasks = this.taskStore.list();
      const runs = this.pipelineStore?.listRuns(20) ?? [];
      const jobs = this.pipelineStore?.listDefinitions() ?? [];
      const queue = this.pipelineStore?.listPostQueue(50) ?? [];
      const notifications = (await this.notificationStore?.list({ limit: 50 })) ?? [];
      const sessions = (await this.transcriptStore?.listSessions()) ?? [];
      this.sendJson(res, 200, {
        counts: {
          tasks: tasks.length,
          jobs: jobs.length,
          runs: runs.length,
          queue: queue.length,
          notifications: notifications.length,
          sessions: sessions.length,
        },
        recent_runs: runs.slice(0, 10),
        recent_notifications: notifications.slice(0, 10),
        queue: queue.slice(0, 10),
        metrics: this.latencyTracker.snapshot(),
      });
      return;
    }

    if (method === "GET" && url.pathname === "/api/workspaces") {
      if (!this.compatStore) {
        this.sendJson(res, 503, { error: "compatibility store unavailable" });
        return;
      }
      const includeStats = url.searchParams.get("stats") === "true";
      this.sendJson(res, 200, this.compatStore.listWorkspaces(includeStats));
      return;
    }

    if (method === "POST" && url.pathname === "/api/workspaces") {
      if (!this.compatStore) {
        this.sendJson(res, 503, { error: "compatibility store unavailable" });
        return;
      }
      const body = await this.readJsonBody(req);
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) {
        this.sendJson(res, 400, { error: "Name is required" });
        return;
      }
      const workspace = this.compatStore.createWorkspace({
        name,
        description: typeof body.description === "string" ? body.description : undefined,
        icon: typeof body.icon === "string" ? body.icon : undefined,
      });
      this.sendJson(res, 201, workspace);
      return;
    }

    if (url.pathname.startsWith("/api/workspaces/")) {
      if (!this.compatStore) {
        this.sendJson(res, 503, { error: "compatibility store unavailable" });
        return;
      }
      const workspaceId = url.pathname.replace("/api/workspaces/", "");
      if (method === "GET") {
        const workspace = this.compatStore.getWorkspace(workspaceId);
        if (!workspace) {
          this.sendJson(res, 404, { error: "Workspace not found" });
          return;
        }
        this.sendJson(res, 200, workspace);
        return;
      }
      if (method === "PATCH") {
        const body = await this.readJsonBody(req);
        const workspace = this.compatStore.patchWorkspace(workspaceId, {
          name: typeof body.name === "string" ? body.name : undefined,
          description:
            typeof body.description === "string" ? body.description : undefined,
          icon: typeof body.icon === "string" ? body.icon : undefined,
        });
        if (!workspace) {
          this.sendJson(res, 404, { error: "Workspace not found" });
          return;
        }
        this.sendJson(res, 200, workspace);
        return;
      }
      if (method === "DELETE") {
        const deleted = this.compatStore.deleteWorkspace(workspaceId);
        if (!deleted.ok) {
          if (deleted.reason === "Workspace not found") {
            this.sendJson(res, 404, { error: deleted.reason });
            return;
          }
          this.sendJson(res, 400, {
            error: deleted.reason,
            taskCount: deleted.taskCount,
            agentCount: deleted.agentCount,
          });
          return;
        }
        this.sendJson(res, 200, { success: true });
        return;
      }
    }

    if (method === "GET" && url.pathname === "/api/agents") {
      if (!this.compatStore) {
        this.sendJson(res, 503, { error: "compatibility store unavailable" });
        return;
      }
      const workspaceId = url.searchParams.get("workspace_id") ?? undefined;
      this.sendJson(res, 200, this.compatStore.listAgents(workspaceId));
      return;
    }

    if (method === "POST" && url.pathname === "/api/agents") {
      if (!this.compatStore) {
        this.sendJson(res, 503, { error: "compatibility store unavailable" });
        return;
      }
      const body = await this.readJsonBody(req);
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const role = typeof body.role === "string" ? body.role.trim() : "";
      if (!name || !role) {
        this.sendJson(res, 400, { error: "Name and role are required" });
        return;
      }
      const agent = this.compatStore.createAgent({
        name,
        role,
        description: typeof body.description === "string" ? body.description : undefined,
        avatar_emoji:
          typeof body.avatar_emoji === "string" ? body.avatar_emoji : undefined,
        is_master: body.is_master === true,
        workspace_id:
          typeof body.workspace_id === "string" ? body.workspace_id : undefined,
        soul_md: typeof body.soul_md === "string" ? body.soul_md : undefined,
        user_md: typeof body.user_md === "string" ? body.user_md : undefined,
        agents_md: typeof body.agents_md === "string" ? body.agents_md : undefined,
      });
      this.sendJson(res, 201, agent);
      return;
    }

    if (url.pathname.startsWith("/api/agents/")) {
      if (!this.compatStore) {
        this.sendJson(res, 503, { error: "compatibility store unavailable" });
        return;
      }
      const agentId = url.pathname.replace("/api/agents/", "");
      if (method === "GET") {
        const agent = this.compatStore.getAgent(agentId);
        if (!agent) {
          this.sendJson(res, 404, { error: "Agent not found" });
          return;
        }
        this.sendJson(res, 200, agent);
        return;
      }
      if (method === "PATCH") {
        const body = await this.readJsonBody(req);
        const agent = this.compatStore.patchAgent(agentId, {
          name: typeof body.name === "string" ? body.name : undefined,
          role: typeof body.role === "string" ? body.role : undefined,
          description:
            typeof body.description === "string" ? body.description : undefined,
          avatar_emoji:
            typeof body.avatar_emoji === "string" ? body.avatar_emoji : undefined,
          status:
            body.status === "standby" ||
            body.status === "working" ||
            body.status === "offline"
              ? body.status
              : undefined,
          is_master: typeof body.is_master === "boolean" ? body.is_master : undefined,
          soul_md: typeof body.soul_md === "string" ? body.soul_md : undefined,
          user_md: typeof body.user_md === "string" ? body.user_md : undefined,
          agents_md: typeof body.agents_md === "string" ? body.agents_md : undefined,
        });
        if (!agent) {
          this.sendJson(res, 404, { error: "Agent not found" });
          return;
        }
        this.sendJson(res, 200, agent);
        return;
      }
      if (method === "DELETE") {
        const deleted = this.compatStore.deleteAgent(agentId);
        if (!deleted.ok) {
          this.sendJson(res, 404, { error: "Agent not found" });
          return;
        }
        this.sendJson(res, 200, { success: true });
        return;
      }
    }

    if (method === "GET" && url.pathname === "/api/events") {
      if (!this.compatStore) {
        this.sendJson(res, 503, { error: "compatibility store unavailable" });
        return;
      }
      const limit = Number(url.searchParams.get("limit") ?? "50");
      const since = url.searchParams.get("since") ?? undefined;
      this.sendJson(
        res,
        200,
        this.compatStore.listEvents({ limit: Number.isFinite(limit) ? limit : 50, since }),
      );
      return;
    }

    if (method === "POST" && url.pathname === "/api/events") {
      if (!this.compatStore) {
        this.sendJson(res, 503, { error: "compatibility store unavailable" });
        return;
      }
      const body = await this.readJsonBody(req);
      const type = typeof body.type === "string" ? body.type : "";
      const message = typeof body.message === "string" ? body.message : "";
      if (!type || !message) {
        this.sendJson(res, 400, { error: "Type and message are required" });
        return;
      }
      const event = this.compatStore.createEvent({
        type,
        message,
        agent_id: typeof body.agent_id === "string" ? body.agent_id : undefined,
        task_id: typeof body.task_id === "string" ? body.task_id : undefined,
        metadata:
          body.metadata && typeof body.metadata === "object" ? body.metadata : undefined,
      });
      this.sendJson(res, 201, event);
      return;
    }

    if (method === "GET" && url.pathname === "/api/openclaw/status") {
      const bridgeUrl =
        process.env.OPENCLAW_GATEWAY_URL ??
        `http://127.0.0.1:${process.env.OPENCLAW_BRIDGE_PORT ?? "4318"}`;
      this.sendJson(res, 200, {
        connected: true,
        gateway_url: bridgeUrl,
        mode: process.env.INTERFACE_MODE ?? "mission-control",
      });
      return;
    }

    if (method === "GET" && url.pathname === "/api/scheduler/mode") {
      const schedulerMode = process.env.SCHEDULER_MODE ?? "internal";
      this.sendJson(res, 200, {
        mode: schedulerMode,
        internal_tick_enabled: schedulerMode === "internal",
        note:
          schedulerMode === "openclaw-cron"
            ? "Expected trigger source: OpenClaw cron -> /api/jobs/:id/trigger"
            : "Runtime setInterval scheduler is active.",
      });
      return;
    }

    if (method === "GET" && url.pathname === "/api/jobs") {
      if (!this.pipelineStore) {
        this.sendJson(res, 503, { error: "pipeline store unavailable" });
        return;
      }
      const jobs = this.pipelineStore.listDefinitions();
      this.sendJson(res, 200, { count: jobs.length, jobs });
      return;
    }

    if (method === "POST" && url.pathname === "/api/jobs") {
      if (!this.pipelineStore) {
        this.sendJson(res, 503, { error: "pipeline store unavailable" });
        return;
      }
      const body = await this.readJsonBody(req);
      const nodes = Array.isArray(body.nodes)
        ? (body.nodes as PipelineDefinition["nodes"])
        : [];
      if (nodes.length === 0) {
        this.sendJson(res, 400, { error: "nodes array is required" });
        return;
      }
      const saved = this.pipelineStore.upsertDefinition({
        id: typeof body.id === "string" ? body.id : undefined,
        name: typeof body.name === "string" ? body.name : "Untitled pipeline",
        enabled: body.enabled === false ? false : true,
        schedule_rrule:
          typeof body.schedule_rrule === "string"
            ? body.schedule_rrule
            : "FREQ=HOURLY;INTERVAL=1",
        max_retries:
          typeof body.max_retries === "number" ? body.max_retries : 1,
        nodes,
        config:
          body.config && typeof body.config === "object"
            ? (body.config as Record<string, unknown>)
            : {},
      });
      this.sendJson(res, 200, { job: saved });
      return;
    }

    if (
      method === "PATCH" &&
      url.pathname.startsWith("/api/jobs/") &&
      !url.pathname.endsWith("/run")
    ) {
      if (!this.pipelineStore) {
        this.sendJson(res, 503, { error: "pipeline store unavailable" });
        return;
      }
      const id = url.pathname.replace("/api/jobs/", "");
      const body = await this.readJsonBody(req);
      try {
        const updated = this.pipelineStore.patchDefinition(id, {
          name: typeof body.name === "string" ? body.name : undefined,
          enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
          schedule_rrule:
            typeof body.schedule_rrule === "string"
              ? body.schedule_rrule
              : undefined,
          max_retries:
            typeof body.max_retries === "number" ? body.max_retries : undefined,
          nodes: Array.isArray(body.nodes)
            ? (body.nodes as PipelineDefinition["nodes"])
            : undefined,
          config:
            body.config && typeof body.config === "object"
              ? (body.config as Record<string, unknown>)
              : undefined,
        });
        this.sendJson(res, 200, { job: updated });
      } catch (error) {
        this.sendJson(res, 404, { error: String(error) });
      }
      return;
    }

    if (
      method === "POST" &&
      url.pathname.startsWith("/api/jobs/") &&
      url.pathname.endsWith("/run")
    ) {
      if (!this.pipelineEngine) {
        this.sendJson(res, 503, { error: "pipeline engine unavailable" });
        return;
      }
      const id = url.pathname.replace("/api/jobs/", "").replace("/run", "");
      const body = await this.readJsonBody(req);
      const run = await this.pipelineEngine.startRun({
        definitionId: id,
        trigger: "manual",
        approval_token:
          typeof body.approval_token === "string"
            ? body.approval_token
            : undefined,
      });
      this.sendJson(res, 200, { run });
      return;
    }

    if (
      method === "POST" &&
      url.pathname.startsWith("/api/jobs/") &&
      url.pathname.endsWith("/trigger")
    ) {
      if (!this.pipelineEngine) {
        this.sendJson(res, 503, { error: "pipeline engine unavailable" });
        return;
      }
      const id = url.pathname.replace("/api/jobs/", "").replace("/trigger", "");
      const body = await this.readJsonBody(req);
      const expectedToken = process.env.MISSION_CONTROL_CRON_TRIGGER_TOKEN;
      const suppliedToken =
        req.headers["x-mc-cron-token"] ??
        req.headers["x-mission-control-token"] ??
        body.token;
      if (expectedToken && suppliedToken !== expectedToken) {
        this.sendJson(res, 403, {
          error: "invalid cron trigger token",
        });
        return;
      }
      const run = await this.pipelineEngine.startRun({
        definitionId: id,
        trigger: "scheduler",
        approval_token:
          typeof body.approval_token === "string"
            ? body.approval_token
            : undefined,
      });
      this.sendJson(res, 200, { run, trigger: "scheduler", source: "external" });
      return;
    }

    if (method === "GET" && url.pathname === "/api/job-runs") {
      if (!this.pipelineStore) {
        this.sendJson(res, 503, { error: "pipeline store unavailable" });
        return;
      }
      const runs = this.pipelineStore.listRuns();
      this.sendJson(res, 200, { count: runs.length, runs });
      return;
    }

    if (method === "GET" && url.pathname.startsWith("/api/job-runs/")) {
      if (!this.pipelineStore) {
        this.sendJson(res, 503, { error: "pipeline store unavailable" });
        return;
      }
      const runId = url.pathname.replace("/api/job-runs/", "");
      const run = this.pipelineStore.getRun(runId);
      if (!run) {
        this.sendJson(res, 404, { error: "run not found" });
        return;
      }
      const nodes = this.pipelineStore.listNodeRuns(runId);
      const artifacts = this.pipelineStore.listArtifacts(runId);
      this.sendJson(res, 200, { run, nodes, artifacts });
      return;
    }

    if (
      method === "GET" &&
      url.pathname.startsWith("/api/content/runs/") &&
      url.pathname.endsWith("/results")
    ) {
      if (!this.pipelineStore) {
        this.sendJson(res, 503, { error: "pipeline store unavailable" });
        return;
      }
      const runId = url.pathname.replace("/api/content/runs/", "").replace("/results", "");
      const run = this.pipelineStore.getRun(runId);
      if (!run) {
        this.sendJson(res, 404, { error: "run not found" });
        return;
      }
      const artifacts = this.pipelineStore.listArtifacts(runId);
      const postQueue = this.pipelineStore
        .listPostQueue(500)
        .filter((item) => item.run_id === runId);
      this.sendJson(res, 200, { run, artifacts, post_queue: postQueue });
      return;
    }

    if (
      method === "GET" &&
      url.pathname.startsWith("/api/pipelines/") &&
      url.pathname.endsWith("/graph")
    ) {
      if (!this.pipelineStore) {
        this.sendJson(res, 503, { error: "pipeline store unavailable" });
        return;
      }
      const runId = url.pathname.replace("/api/pipelines/", "").replace("/graph", "");
      const graph = this.pipelineStore.listNodeRuns(runId).map((node) => ({
        node_id: node.node_id,
        agent_id: node.agent_id,
        status: node.status,
        depends_on: node.depends_on,
        attempts: node.attempts,
      }));
      this.sendJson(res, 200, { run_id: runId, graph });
      return;
    }

    if (
      method === "POST" &&
      url.pathname.includes("/api/pipelines/") &&
      url.pathname.endsWith("/retry")
    ) {
      if (!this.pipelineEngine) {
        this.sendJson(res, 503, { error: "pipeline engine unavailable" });
        return;
      }
      const match = url.pathname.match(/^\/api\/pipelines\/([^/]+)\/nodes\/([^/]+)\/retry$/);
      if (!match) {
        this.sendJson(res, 400, { error: "invalid retry path" });
        return;
      }
      await this.pipelineEngine.retryNode(match[1], match[2]);
      this.sendJson(res, 200, { status: "ok" });
      return;
    }

    if (
      method === "POST" &&
      url.pathname.includes("/api/pipelines/") &&
      url.pathname.endsWith("/override")
    ) {
      if (!this.pipelineEngine) {
        this.sendJson(res, 503, { error: "pipeline engine unavailable" });
        return;
      }
      const match = url.pathname.match(/^\/api\/pipelines\/([^/]+)\/nodes\/([^/]+)\/override$/);
      if (!match) {
        this.sendJson(res, 400, { error: "invalid override path" });
        return;
      }
      const body = await this.readJsonBody(req);
      const reason = typeof body.reason === "string" ? body.reason : "manual-override";
      await this.pipelineEngine.overrideNode(match[1], match[2], reason);
      this.sendJson(res, 200, { status: "ok" });
      return;
    }

    if (method === "GET" && url.pathname === "/api/post-queue") {
      if (!this.pipelineStore) {
        this.sendJson(res, 503, { error: "pipeline store unavailable" });
        return;
      }
      const items = this.pipelineStore.listPostQueue();
      this.sendJson(res, 200, { count: items.length, items });
      return;
    }

    if (
      method === "POST" &&
      url.pathname.startsWith("/api/post-queue/") &&
      url.pathname.endsWith("/approve")
    ) {
      if (!this.pipelineStore) {
        this.sendJson(res, 503, { error: "pipeline store unavailable" });
        return;
      }
      const id = url.pathname.replace("/api/post-queue/", "").replace("/approve", "");
      const item = this.pipelineStore.patchPostQueue(id, {
        status: "approved",
        approved_by: "mission-control",
      });
      if (!item) {
        this.sendJson(res, 404, { error: "post queue item not found" });
        return;
      }
      this.sendJson(res, 200, { item });
      return;
    }

    if (
      method === "POST" &&
      url.pathname.startsWith("/api/post-queue/") &&
      url.pathname.endsWith("/dispatch")
    ) {
      if (!this.pipelineEngine) {
        this.sendJson(res, 503, { error: "pipeline engine unavailable" });
        return;
      }
      const id = url.pathname.replace("/api/post-queue/", "").replace("/dispatch", "");
      const result = await this.pipelineEngine.dispatchPostQueueItem({
        id,
        approvedBy: "mission-control",
      });
      this.sendJson(res, 200, result);
      return;
    }

    if (method === "POST" && url.pathname === "/api/media/jobs") {
      if (!this.pipelineStore) {
        this.sendJson(res, 503, { error: "pipeline store unavailable" });
        return;
      }
      const body = await this.readJsonBody(req);
      const runId = typeof body.run_id === "string" ? body.run_id : "";
      const nodeId = typeof body.node_id === "string" ? body.node_id : "media-generator";
      if (!runId) {
        this.sendJson(res, 400, { error: "run_id is required" });
        return;
      }
      const job = this.pipelineStore.createMediaJob({
        run_id: runId,
        node_id: nodeId,
        provider: "higgsfield",
        status: "pending",
        input_json:
          body.input && typeof body.input === "object"
            ? (body.input as Record<string, unknown>)
            : {},
        output_json: {},
        approved_by_token:
          typeof body.approval_token === "string" ? body.approval_token : undefined,
      });
      this.sendJson(res, 200, { media_job: job });
      return;
    }

    if (method === "POST" && url.pathname === "/api/telephony/call") {
      if (!this.telephonyClient) {
        this.sendJson(res, 503, { error: "telephony control unavailable" });
        return;
      }
      const body = await this.readJsonBody(req);
      const to = typeof body.to === "string" ? body.to : "";
      if (!to) {
        this.sendJson(res, 400, { error: "to is required" });
        return;
      }
      const result = await this.telephonyClient.placeCall({
        to,
        from: typeof body.from === "string" ? body.from : undefined,
        session_id:
          typeof body.session_id === "string" ? body.session_id : undefined,
        user_id: typeof body.user_id === "string" ? body.user_id : undefined,
      });
      this.sendJson(res, 200, result);
      return;
    }

    if (method === "GET" && url.pathname === "/api/telephony/media/sessions") {
      if (!this.telephonyClient) {
        this.sendJson(res, 503, { error: "telephony control unavailable" });
        return;
      }
      const result = await this.telephonyClient.listMediaSessions();
      this.sendJson(res, 200, result);
      return;
    }

    if (method === "GET" && url.pathname === "/api/tasks") {
      const compatFilter = {
        workspace_id: url.searchParams.get("workspace_id") ?? undefined,
        status: url.searchParams.get("status") ?? undefined,
        business_id: url.searchParams.get("business_id") ?? undefined,
        assigned_agent_id: url.searchParams.get("assigned_agent_id") ?? undefined,
      };
      const useCompat =
        Boolean(compatFilter.workspace_id) ||
        Boolean(compatFilter.status) ||
        Boolean(compatFilter.business_id) ||
        Boolean(compatFilter.assigned_agent_id) ||
        url.searchParams.get("format") === "compat";
      if (useCompat && this.compatStore) {
        this.sendJson(res, 200, this.compatStore.listTasks(compatFilter));
        return;
      }
      const tasks = this.taskStore.list();
      this.sendJson(res, 200, {
        count: tasks.length,
        tasks: tasks.map((task) => ({
          id: task.id,
          title: task.title,
          status: task.status,
          created_at: task.created_at,
          objective: task.objective,
          artifacts_count: task.artifacts.length,
          logs_count: task.logs.length,
          approvals_count: task.approvals_required.length,
        })),
      });
      return;
    }

    if (method === "POST" && url.pathname === "/api/tasks") {
      if (!this.compatStore) {
        this.sendJson(res, 503, { error: "compatibility store unavailable" });
        return;
      }
      const body = await this.readJsonBody(req);
      const title = typeof body.title === "string" ? body.title.trim() : "";
      if (!title) {
        this.sendJson(res, 400, { error: "Title is required" });
        return;
      }
      const task = this.compatStore.createTask({
        title,
        description: typeof body.description === "string" ? body.description : undefined,
        status:
          body.status === "planning" ||
          body.status === "inbox" ||
          body.status === "assigned" ||
          body.status === "in_progress" ||
          body.status === "testing" ||
          body.status === "review" ||
          body.status === "done"
            ? body.status
            : undefined,
        priority:
          body.priority === "low" ||
          body.priority === "normal" ||
          body.priority === "high" ||
          body.priority === "urgent"
            ? body.priority
            : undefined,
        assigned_agent_id:
          typeof body.assigned_agent_id === "string"
            ? body.assigned_agent_id
            : undefined,
        created_by_agent_id:
          typeof body.created_by_agent_id === "string"
            ? body.created_by_agent_id
            : undefined,
        workspace_id:
          typeof body.workspace_id === "string" ? body.workspace_id : undefined,
        business_id:
          typeof body.business_id === "string" ? body.business_id : undefined,
        due_date: typeof body.due_date === "string" ? body.due_date : undefined,
      });
      this.sendJson(res, 201, task);
      return;
    }

    if (method === "GET" && url.pathname === "/api/sessions") {
      const sessions = await this.transcriptStore?.listSessions();
      this.sendJson(res, 200, {
        count: sessions?.length ?? 0,
        sessions: sessions ?? [],
      });
      return;
    }

    if (method === "GET" && url.pathname.startsWith("/api/sessions/")) {
      const sessionId = url.pathname.replace("/api/sessions/", "");
      if (!sessionId) {
        this.sendJson(res, 400, { error: "session_id required" });
        return;
      }
      const transcript = await this.transcriptStore?.listBySession(sessionId);
      this.sendJson(res, 200, {
        session_id: sessionId,
        count: transcript?.length ?? 0,
        transcript: transcript ?? [],
      });
      return;
    }

    if (method === "GET" && url.pathname === "/api/notifications") {
      const filter = this.parseNotificationFilter(url);
      const notifications = await this.notificationStore?.list(filter);
      this.sendJson(res, 200, {
        count: notifications?.length ?? 0,
        notifications: notifications ?? [],
      });
      return;
    }

    if (
      method === "POST" &&
      url.pathname.startsWith("/api/notifications/") &&
      url.pathname.endsWith("/ack")
    ) {
      const id = url.pathname.replace("/api/notifications/", "").replace("/ack", "");
      if (!id) {
        this.sendJson(res, 400, { error: "notification id required" });
        return;
      }
      const record = await this.notificationStore?.acknowledge(id);
      if (!record) {
        this.sendJson(res, 404, { error: "notification not found" });
        return;
      }
      this.sendJson(res, 200, { notification: record });
      return;
    }

    if (method === "POST" && url.pathname === "/api/realtime/session") {
      if (!this.realtimeSessionBroker) {
        this.sendJson(res, 503, {
          error: "Realtime session broker unavailable (set OPENAI_API_KEY + OPENAI_REALTIME_ENABLED=true).",
        });
        return;
      }
      const body = await this.readJsonBody(req);
      const session = await this.realtimeSessionBroker.createSession({
        voice: typeof body.voice === "string" ? body.voice : undefined,
        instructions:
          typeof body.instructions === "string" ? body.instructions : undefined,
      });
      this.sendJson(res, 200, {
        realtime_session: {
          id: session.id,
          model: session.model,
          voice: session.voice,
          expires_at: session.expires_at,
          client_secret: session.client_secret,
        },
      });
      return;
    }

    if (url.pathname.startsWith("/api/tasks/")) {
      const taskId = url.pathname.replace("/api/tasks/", "");
      if (this.compatStore && (taskId.startsWith("mctask_") || url.searchParams.get("format") === "compat")) {
        if (method === "GET") {
          const task = this.compatStore.getTask(taskId);
          if (!task) {
            this.sendJson(res, 404, { error: "Task not found" });
            return;
          }
          this.sendJson(res, 200, task);
          return;
        }
        if (method === "PATCH") {
          const body = await this.readJsonBody(req);
          const task = this.compatStore.patchTask(taskId, {
            title: typeof body.title === "string" ? body.title : undefined,
            description:
              typeof body.description === "string" ? body.description : undefined,
            status:
              body.status === "planning" ||
              body.status === "inbox" ||
              body.status === "assigned" ||
              body.status === "in_progress" ||
              body.status === "testing" ||
              body.status === "review" ||
              body.status === "done"
                ? body.status
                : undefined,
            priority:
              body.priority === "low" ||
              body.priority === "normal" ||
              body.priority === "high" ||
              body.priority === "urgent"
                ? body.priority
                : undefined,
            assigned_agent_id:
              typeof body.assigned_agent_id === "string"
                ? body.assigned_agent_id
                : body.assigned_agent_id === null
                  ? null
                  : undefined,
            due_date:
              typeof body.due_date === "string"
                ? body.due_date
                : body.due_date === null
                  ? null
                  : undefined,
          });
          if (!task) {
            this.sendJson(res, 404, { error: "Task not found" });
            return;
          }
          this.sendJson(res, 200, task);
          return;
        }
        if (method === "DELETE") {
          const deleted = this.compatStore.deleteTask(taskId);
          if (!deleted.ok) {
            this.sendJson(res, 404, { error: "Task not found" });
            return;
          }
          this.sendJson(res, 200, { success: true });
          return;
        }
      }

      if (method === "GET") {
        const task = this.taskStore.get(taskId);
        if (!task) {
          this.sendJson(res, 404, { error: "task not found" });
          return;
        }

        let trace: unknown = null;
        try {
          trace = await this.traceStore.read(taskId);
        } catch {
          trace = null;
        }

        this.sendJson(res, 200, { task, trace });
        return;
      }
    }

    if (method === "POST" && url.pathname === "/api/messages") {
      const body = await this.readJsonBody(req);
      const text = typeof body.text === "string" ? body.text.trim() : "";
      if (!text) {
        this.sendJson(res, 400, { error: "text is required" });
        return;
      }

      const result = await this.controller.handleMessage({
        session_id:
          typeof body.session_id === "string" ? body.session_id : randomUUID(),
        user_id: typeof body.user_id === "string" ? body.user_id : "local-user",
        text,
        source: "local",
      });

      this.sendJson(res, 200, {
        outbound: result.messages,
        approvals: result.approvalRequests,
        notifications: result.notifications,
        metrics: result.metrics,
      });
      await this.persistLocalNotifications(result.notifications, {
        session_id:
          typeof body.session_id === "string" ? body.session_id : "local-session",
        user_id: typeof body.user_id === "string" ? body.user_id : "local-user",
      });
      return;
    }

    if (method === "POST" && url.pathname === "/api/approvals") {
      const body = await this.readJsonBody(req);
      const taskId = typeof body.task_id === "string" ? body.task_id : "";
      const approvalId =
        typeof body.approval_id === "string" ? body.approval_id : "";
      const decision = body.decision;
      if (
        !taskId ||
        !approvalId ||
        (decision !== "approved" && decision !== "denied")
      ) {
        this.sendJson(res, 400, {
          error: "task_id, approval_id, decision (approved|denied) required",
        });
        return;
      }

      const result = await this.controller.handleApprovalDecision({
        session_id:
          typeof body.session_id === "string" ? body.session_id : randomUUID(),
        user_id: typeof body.user_id === "string" ? body.user_id : "local-user",
        task_id: taskId,
        approval_id: approvalId,
        decision,
      });

      this.sendJson(res, 200, {
        outbound: result.messages,
        notifications: result.notifications,
      });
      await this.persistLocalNotifications(result.notifications, {
        session_id:
          typeof body.session_id === "string" ? body.session_id : "local-session",
        user_id: typeof body.user_id === "string" ? body.user_id : "local-user",
      });
      return;
    }

    if (method === "GET" && url.pathname === "/") {
      this.sendHtml(res, this.renderHtml());
      return;
    }

    this.sendJson(res, 404, { error: "not found" });
  }

  private async readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    for await (const chunk of req) {
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        throw new ValidationError(`Request body exceeds ${MAX_BODY_BYTES} bytes`);
      }
      chunks.push(Buffer.from(chunk));
    }
    if (chunks.length === 0) {
      return {};
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  }

  private sendJson(res: ServerResponse, status: number, body: unknown): void {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "content-length": Buffer.byteLength(payload),
    });
    res.end(payload);
  }

  private sendHtml(res: ServerResponse, html: string): void {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
  }

  private parseNotificationFilter(url: URL): NotificationFilter {
    const query = url.searchParams;
    const limit = query.get("limit");
    return {
      channel:
        query.get("channel") === "notify_user" || query.get("channel") === "call_user"
          ? (query.get("channel") as NotificationFilter["channel"])
          : undefined,
      reason: query.get("reason") as NotificationFilter["reason"] | undefined,
      severity: query.get("severity") as NotificationFilter["severity"] | undefined,
      status: query.get("status") as NotificationFilter["status"] | undefined,
      task_id: query.get("task_id") ?? undefined,
      session_id: query.get("session_id") ?? undefined,
      limit: limit ? Number(limit) : undefined,
    };
  }

  private async persistLocalNotifications(
    notifications: Array<{
      channel: "notify_user" | "call_user";
      reason: NotificationRecord["reason"];
      message: string;
      task_id?: string;
      severity: "info" | "warning" | "critical";
    }>,
    context: { session_id: string; user_id: string },
  ): Promise<void> {
    for (const item of notifications) {
      await this.notificationStore?.append({
        event_id: randomUUID(),
        created_at: new Date().toISOString(),
        channel: item.channel,
        reason: item.reason,
        message: item.message,
        severity: item.severity,
        task_id: item.task_id,
        session_id: context.session_id,
        user_id: context.user_id,
      });
    }
  }

  private renderHtml(): string {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ClawDeck Mission Control</title>
  <style>
    :root {
      --mc-bg: #0d1117;
      --mc-bg-secondary: #161b22;
      --mc-bg-tertiary: #21262d;
      --mc-border: #30363d;
      --mc-text: #c9d1d9;
      --mc-text-secondary: #8b949e;
      --mc-accent: #58a6ff;
      --mc-accent-green: #3fb950;
      --mc-accent-yellow: #d29922;
      --mc-accent-red: #f85149;
      --mc-accent-purple: #a371f7;
      --mc-accent-cyan: #39d353;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--mc-text);
      background:
        radial-gradient(900px 420px at 90% -10%, rgba(88,166,255,0.17) 0%, transparent 64%),
        radial-gradient(700px 460px at -10% 20%, rgba(163,113,247,0.18) 0%, transparent 60%),
        var(--mc-bg);
      font-family: "JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .wrap {
      max-width: 1360px;
      margin: 0 auto;
      padding: 20px 16px 30px;
    }
    .hero {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 16px;
      padding: 18px;
      border: 1px solid var(--mc-border);
      border-radius: 16px;
      background: linear-gradient(135deg, rgba(22,27,34,0.95), rgba(13,17,23,0.95));
      box-shadow: 0 18px 40px rgba(0,0,0,0.4);
    }
    .hero h1 {
      margin: 0;
      font-size: 34px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .hero p {
      margin: 6px 0 0;
      color: var(--mc-text-secondary);
    }
    .pulse {
      border: 1px solid var(--mc-border);
      border-radius: 999px;
      padding: 6px 12px;
      font-size: 12px;
      color: #9dc4ff;
      background: rgba(88,166,255,0.12);
    }
    .cards {
      margin-top: 14px;
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 10px;
    }
    .card {
      background: linear-gradient(180deg, rgba(22,27,34,0.95), rgba(13,17,23,0.95));
      border: 1px solid var(--mc-border);
      border-radius: 12px;
      padding: 10px;
      min-height: 92px;
    }
    .card .k {
      font-size: 11px;
      color: var(--mc-text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.7px;
    }
    .card .v {
      font-size: 30px;
      font-weight: 700;
      margin-top: 6px;
    }
    .grid {
      margin-top: 14px;
      display: grid;
      grid-template-columns: 1.45fr 1fr;
      gap: 12px;
    }
    .panel {
      background: linear-gradient(180deg, rgba(22,27,34,0.95), rgba(13,17,23,0.95));
      border: 1px solid var(--mc-border);
      border-radius: 14px;
      padding: 12px;
    }
    .panel h2 {
      margin: 0 0 10px;
      font-size: 15px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      color: #d2e8ff;
    }
    .toolbar {
      display: grid;
      grid-template-columns: 1fr auto auto;
      gap: 8px;
      margin-bottom: 8px;
    }
    .toolbar.dual {
      grid-template-columns: 1fr 1fr auto;
    }
    input, button, select {
      width: 100%;
      border: 1px solid var(--mc-border);
      border-radius: 9px;
      background: var(--mc-bg-tertiary);
      color: var(--mc-text);
      padding: 9px 10px;
      font: inherit;
    }
    button {
      cursor: pointer;
      background: linear-gradient(180deg, #58a6ff, #3f87db);
      border-color: #69b2ff;
      color: #061018;
      font-weight: 700;
      white-space: nowrap;
    }
    button.alt {
      background: linear-gradient(180deg, #2b3242, #212734);
      border-color: #3b4254;
      color: #e8f0ff;
      font-weight: 600;
    }
    button.warn {
      background: linear-gradient(180deg, #d29922, #b17f19);
      border-color: #e1b14b;
      color: #170c00;
    }
    .scroll {
      max-height: 320px;
      overflow: auto;
      border: 1px solid var(--mc-border);
      border-radius: 10px;
      background: var(--mc-bg-secondary);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    th, td {
      border-bottom: 1px solid #2a3344;
      padding: 7px 8px;
      text-align: left;
      vertical-align: top;
    }
    th {
      color: #aac0e6;
      font-weight: 600;
      position: sticky;
      top: 0;
      background: var(--mc-bg-secondary);
    }
    tr:hover { background: rgba(88,166,255,0.16); cursor: pointer; }
    .json {
      max-height: 250px;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
      background: var(--mc-bg-secondary);
      border: 1px solid var(--mc-border);
      border-radius: 10px;
      padding: 8px;
      font-size: 12px;
      color: #c9d1d9;
    }
    .graph {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 8px;
    }
    .node {
      border-radius: 10px;
      border: 1px solid #3a4b65;
      padding: 8px;
      background: var(--mc-bg-secondary);
      min-height: 80px;
    }
    .node h4 {
      margin: 0 0 6px;
      font-size: 12px;
      text-transform: uppercase;
      color: #c9d1d9;
    }
    .badge {
      display: inline-block;
      border-radius: 999px;
      padding: 2px 8px;
      border: 1px solid #3a4b65;
      font-size: 11px;
      color: #d2e0fb;
      background: #1b2332;
    }
    .s-completed { border-color: var(--mc-accent-green); }
    .s-running { border-color: var(--mc-accent); }
    .s-failed { border-color: var(--mc-accent-red); }
    .s-blocked, .s-awaiting_approval { border-color: var(--mc-accent-yellow); }
    .cols-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    @media (max-width: 1120px) {
      .cards { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 760px) {
      .cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .toolbar, .toolbar.dual { grid-template-columns: 1fr; }
      .cols-2 { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <section class="hero">
      <div>
        <h1>🦞 ClawDeck Mission Control</h1>
        <p>Unified command surface for scheduler, DAG orchestration, queue dispatch, tasks, notifications, and telephony.</p>
      </div>
      <div class="pulse" id="heartbeat">refreshing...</div>
    </section>

    <section class="cards" id="statCards">
      <div class="card"><div class="k">Tasks</div><div class="v" id="cTasks">0</div></div>
      <div class="card"><div class="k">Jobs</div><div class="v" id="cJobs">0</div></div>
      <div class="card"><div class="k">Runs</div><div class="v" id="cRuns">0</div></div>
      <div class="card"><div class="k">Queue</div><div class="v" id="cQueue">0</div></div>
      <div class="card"><div class="k">Notifications</div><div class="v" id="cNotifs">0</div></div>
      <div class="card"><div class="k">Sessions</div><div class="v" id="cSessions">0</div></div>
    </section>

    <section class="grid">
      <div class="panel">
        <h2>Scheduler Studio</h2>
        <div class="toolbar dual">
          <input id="jobName" value="Content Automation Default" />
          <input id="jobId" value="content-automation-default" />
          <button id="saveDefaultJob">Save Default DAG</button>
        </div>
        <div class="toolbar">
          <input id="approvalToken" placeholder="optional approval token for paid nodes" />
          <button id="runJobNow">Run Job</button>
          <button class="alt" id="refreshJobs">Refresh Jobs</button>
        </div>
        <div class="scroll">
          <table>
            <thead><tr><th>Job</th><th>Schedule</th><th>Enabled</th><th>Retries</th></tr></thead>
            <tbody id="jobsBody"></tbody>
          </table>
        </div>
        <div class="json" id="jobActionResult">No scheduler actions yet.</div>
      </div>

      <div class="panel">
        <h2>Telephony Command</h2>
        <div class="toolbar dual">
          <input id="callTo" placeholder="+1 phone number" />
          <input id="callFrom" placeholder="+1 twilio from (optional)" />
          <button id="placeCall">Place Call</button>
        </div>
        <div class="toolbar">
          <button class="alt" id="refreshMedia">Refresh Media Sessions</button>
          <button class="alt" id="newRealtime">Realtime Session</button>
          <input id="realtimeVoice" value="alloy" />
        </div>
        <div class="json" id="telephonyResult">No telephony activity yet.</div>
      </div>
    </section>

    <section class="grid">
      <div class="panel">
        <h2>Run Timeline</h2>
        <div class="toolbar">
          <input id="selectedRunId" placeholder="run id for graph/detail auto-fills on row click" />
          <button class="alt" id="refreshRuns">Refresh Runs</button>
          <button class="warn" id="openRun">Open Run</button>
        </div>
        <div class="scroll">
          <table>
            <thead><tr><th>Started</th><th>Status</th><th>Trigger</th><th>Run ID</th></tr></thead>
            <tbody id="runsBody"></tbody>
          </table>
        </div>
      </div>

      <div class="panel">
        <h2>DAG Graph View</h2>
        <div class="toolbar dual">
          <input id="retryNodeId" placeholder="node id for retry/override" />
          <button class="alt" id="retryNode">Retry Node</button>
          <button class="warn" id="overrideNode">Override Node</button>
        </div>
        <div class="graph" id="graphNodes"></div>
        <div class="json" id="runDetail">Select a run to inspect graph and artifacts.</div>
      </div>
    </section>

    <section class="grid">
      <div class="panel">
        <h2>Post Queue</h2>
        <div class="toolbar">
          <input id="queueItemId" placeholder="queue item id" />
          <button id="approveQueue">Approve</button>
          <button class="warn" id="dispatchQueue">Dispatch</button>
        </div>
        <div class="scroll">
          <table>
            <thead><tr><th>Created</th><th>Platform</th><th>Status</th><th>ID</th></tr></thead>
            <tbody id="queueBody"></tbody>
          </table>
        </div>
        <div class="json" id="queueResult">No queue action yet.</div>
      </div>

      <div class="panel">
        <h2>Notifications + Sessions</h2>
        <div class="cols-2">
          <div>
            <button class="alt" id="refreshNotifs">Refresh Notifications</button>
            <div class="scroll" style="margin-top:8px">
              <table>
                <thead><tr><th>Reason</th><th>Severity</th><th>Status</th></tr></thead>
                <tbody id="notifBody"></tbody>
              </table>
            </div>
          </div>
          <div>
            <button class="alt" id="refreshSessions">Refresh Sessions</button>
            <div class="scroll" style="margin-top:8px">
              <table>
                <thead><tr><th>Session</th><th>Latest</th></tr></thead>
                <tbody id="sessionBody"></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="grid">
      <div class="panel">
        <h2>Task Console</h2>
        <div class="toolbar">
          <input id="messageInput" placeholder="type a mission-control prompt" />
          <button id="runTask">Run Task</button>
          <button class="alt" id="refreshTasks">Refresh Tasks</button>
        </div>
        <div class="scroll">
          <table>
            <thead><tr><th>Created</th><th>Status</th><th>Title</th><th>ID</th></tr></thead>
            <tbody id="taskBody"></tbody>
          </table>
        </div>
      </div>
      <div class="panel">
        <h2>Detail Inspector</h2>
        <div class="json" id="detailBox">Click any task/run/queue row for detailed payload.</div>
      </div>
    </section>
  </div>

<script>
const el = (id) => document.getElementById(id);

function safeJson(value) {
  try { return JSON.stringify(value, null, 2); } catch (e) { return String(value); }
}

async function getJson(path) {
  const res = await fetch(path);
  return res.json();
}

async function postJson(path, payload) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload || {})
  });
  return res.json();
}

function setHeartbeat(text) {
  el('heartbeat').textContent = text;
}

function setCards(counts) {
  el('cTasks').textContent = String(counts.tasks || 0);
  el('cJobs').textContent = String(counts.jobs || 0);
  el('cRuns').textContent = String(counts.runs || 0);
  el('cQueue').textContent = String(counts.queue || 0);
  el('cNotifs').textContent = String(counts.notifications || 0);
  el('cSessions').textContent = String(counts.sessions || 0);
}

async function refreshDashboard() {
  const data = await getJson('/api/dashboard');
  setCards(data.counts || {});
}

async function refreshJobs() {
  const data = await getJson('/api/jobs');
  const body = el('jobsBody');
  body.innerHTML = '';
  for (const job of data.jobs || []) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td>' + job.name + '</td><td>' + job.schedule_rrule + '</td><td>' + job.enabled + '</td><td>' + job.max_retries + '</td>';
    tr.onclick = function () {
      el('jobId').value = job.id;
      el('detailBox').textContent = safeJson(job);
    };
    body.appendChild(tr);
  }
}

async function refreshRuns() {
  const data = await getJson('/api/job-runs');
  const body = el('runsBody');
  body.innerHTML = '';
  for (const run of data.runs || []) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td>' + new Date(run.started_at).toLocaleString() + '</td><td><span class="badge">' + run.status + '</span></td><td>' + run.trigger + '</td><td>' + run.id + '</td>';
    tr.onclick = function () {
      el('selectedRunId').value = run.id;
      openRun(run.id);
    };
    body.appendChild(tr);
  }
}

function renderGraph(nodes) {
  const graph = el('graphNodes');
  graph.innerHTML = '';
  for (const node of nodes || []) {
    const div = document.createElement('div');
    div.className = 'node s-' + node.status;
    div.innerHTML = '<h4>' + node.node_id + '</h4>'
      + '<div class="badge">' + node.status + '</div>'
      + '<div style="margin-top:6px;font-size:11px;color:#a7bde2">' + node.agent_id + '</div>'
      + '<div style="margin-top:4px;font-size:11px;color:#8ea6ce">depends: ' + (node.depends_on || []).join(', ') + '</div>'
      + '<div style="margin-top:4px;font-size:11px;color:#8ea6ce">attempts: ' + node.attempts + '</div>';
    graph.appendChild(div);
  }
}

async function openRun(runId) {
  if (!runId) {
    return;
  }
  const graphData = await getJson('/api/pipelines/' + encodeURIComponent(runId) + '/graph');
  renderGraph(graphData.graph || []);
  const detail = await getJson('/api/job-runs/' + encodeURIComponent(runId));
  el('runDetail').textContent = safeJson(detail);
}

async function refreshQueue() {
  const data = await getJson('/api/post-queue');
  const body = el('queueBody');
  body.innerHTML = '';
  for (const item of data.items || []) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td>' + new Date(item.created_at).toLocaleString() + '</td><td>' + item.platform + '</td><td>' + item.status + '</td><td>' + item.id + '</td>';
    tr.onclick = function () {
      el('queueItemId').value = item.id;
      el('detailBox').textContent = safeJson(item);
    };
    body.appendChild(tr);
  }
}

async function refreshTasks() {
  const data = await getJson('/api/tasks');
  const body = el('taskBody');
  body.innerHTML = '';
  for (const task of data.tasks || []) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td>' + new Date(task.created_at).toLocaleString() + '</td><td>' + task.status + '</td><td>' + task.title + '</td><td>' + task.id + '</td>';
    tr.onclick = async function () {
      const detail = await getJson('/api/tasks/' + encodeURIComponent(task.id));
      el('detailBox').textContent = safeJson(detail);
    };
    body.appendChild(tr);
  }
}

async function refreshNotifications() {
  const data = await getJson('/api/notifications?limit=50');
  const body = el('notifBody');
  body.innerHTML = '';
  for (const n of data.notifications || []) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td>' + n.reason + '</td><td>' + n.severity + '</td><td>' + n.status + '</td>';
    tr.onclick = function () { el('detailBox').textContent = safeJson(n); };
    body.appendChild(tr);
  }
}

async function refreshSessions() {
  const data = await getJson('/api/sessions');
  const body = el('sessionBody');
  body.innerHTML = '';
  for (const s of data.sessions || []) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td>' + s.session_id + '</td><td>' + (s.last_event_at || s.started_at || '') + '</td>';
    tr.onclick = async function () {
      const detail = await getJson('/api/sessions/' + encodeURIComponent(s.session_id));
      el('detailBox').textContent = safeJson(detail);
    };
    body.appendChild(tr);
  }
}

async function refreshMediaSessions() {
  const data = await getJson('/api/telephony/media/sessions');
  el('telephonyResult').textContent = safeJson(data);
}

el('saveDefaultJob').onclick = async function () {
  const payload = {
    id: 'content-automation-default',
    name: el('jobName').value || 'Content Automation Default',
    enabled: true,
    schedule_rrule: 'FREQ=HOURLY;INTERVAL=1',
    max_retries: 1,
    nodes: [
      { id: 'trend-scout', agent_id: 'trend-scout-agent', depends_on: [] },
      { id: 'research-verify', agent_id: 'research-verifier-agent', depends_on: ['trend-scout'] },
      { id: 'idea-rank', agent_id: 'idea-ranker-agent', depends_on: ['research-verify'] },
      { id: 'script-write', agent_id: 'script-writer-agent', depends_on: ['idea-rank'] },
      { id: 'media-generate', agent_id: 'media-generator-agent', depends_on: ['script-write'], paid_action: true },
      { id: 'compliance-review', agent_id: 'compliance-reviewer-agent', depends_on: ['media-generate'] },
      { id: 'publisher', agent_id: 'publisher-agent', depends_on: ['compliance-review'], paid_action: true },
      { id: 'performance-analyze', agent_id: 'performance-analyst-agent', depends_on: ['publisher'] }
    ]
  };
  const data = await postJson('/api/jobs', payload);
  el('jobActionResult').textContent = safeJson(data);
  await refreshJobs();
  await refreshDashboard();
};

el('runJobNow').onclick = async function () {
  const id = (el('jobId').value || 'content-automation-default').trim();
  const token = (el('approvalToken').value || '').trim();
  const data = await postJson('/api/jobs/' + encodeURIComponent(id) + '/run', {
    approval_token: token || undefined
  });
  el('jobActionResult').textContent = safeJson(data);
  if (data.run && data.run.id) {
    el('selectedRunId').value = data.run.id;
    await openRun(data.run.id);
  }
  await refreshRuns();
  await refreshQueue();
  await refreshDashboard();
};

el('refreshJobs').onclick = refreshJobs;
el('refreshRuns').onclick = refreshRuns;
el('openRun').onclick = function () { openRun(el('selectedRunId').value.trim()); };

el('retryNode').onclick = async function () {
  const runId = el('selectedRunId').value.trim();
  const nodeId = el('retryNodeId').value.trim();
  if (!runId || !nodeId) { return; }
  const data = await postJson('/api/pipelines/' + encodeURIComponent(runId) + '/nodes/' + encodeURIComponent(nodeId) + '/retry', {});
  el('runDetail').textContent = safeJson(data);
  await openRun(runId);
  await refreshRuns();
};

el('overrideNode').onclick = async function () {
  const runId = el('selectedRunId').value.trim();
  const nodeId = el('retryNodeId').value.trim();
  if (!runId || !nodeId) { return; }
  const data = await postJson('/api/pipelines/' + encodeURIComponent(runId) + '/nodes/' + encodeURIComponent(nodeId) + '/override', { reason: 'manual-ui-override' });
  el('runDetail').textContent = safeJson(data);
  await openRun(runId);
  await refreshRuns();
};

el('approveQueue').onclick = async function () {
  const id = el('queueItemId').value.trim();
  if (!id) { return; }
  const data = await postJson('/api/post-queue/' + encodeURIComponent(id) + '/approve', {});
  el('queueResult').textContent = safeJson(data);
  await refreshQueue();
};

el('dispatchQueue').onclick = async function () {
  const id = el('queueItemId').value.trim();
  if (!id) { return; }
  const data = await postJson('/api/post-queue/' + encodeURIComponent(id) + '/dispatch', {});
  el('queueResult').textContent = safeJson(data);
  await refreshQueue();
};

el('placeCall').onclick = async function () {
  const to = el('callTo').value.trim();
  if (!to) { return; }
  const from = el('callFrom').value.trim();
  const data = await postJson('/api/telephony/call', {
    to: to,
    from: from || undefined,
    session_id: 'mc-' + Date.now()
  });
  el('telephonyResult').textContent = safeJson(data);
};

el('refreshMedia').onclick = refreshMediaSessions;
el('newRealtime').onclick = async function () {
  const data = await postJson('/api/realtime/session', { voice: el('realtimeVoice').value || 'alloy' });
  el('telephonyResult').textContent = safeJson(data);
};

el('refreshNotifs').onclick = refreshNotifications;
el('refreshSessions').onclick = refreshSessions;
el('refreshTasks').onclick = refreshTasks;

el('runTask').onclick = async function () {
  const text = el('messageInput').value.trim();
  if (!text) { return; }
  const data = await postJson('/api/messages', { text: text });
  el('detailBox').textContent = safeJson(data);
  el('messageInput').value = '';
  await refreshTasks();
  await refreshDashboard();
};

async function fullRefresh() {
  setHeartbeat('syncing...');
  await Promise.all([
    refreshDashboard(),
    refreshJobs(),
    refreshRuns(),
    refreshQueue(),
    refreshTasks(),
    refreshNotifications(),
    refreshSessions()
  ]);
  setHeartbeat('live @ ' + new Date().toLocaleTimeString());
}

fullRefresh().catch(function (err) {
  setHeartbeat('error');
  el('detailBox').textContent = String(err);
});
setInterval(function () {
  fullRefresh().catch(function () { setHeartbeat('refresh failed'); });
}, 7000);
</script>
</body>
</html>`;
  }
}
