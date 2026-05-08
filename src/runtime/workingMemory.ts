import type { WorkingMemory, WorkingMemoryNote } from "./types.js";

/**
 * Per-run scratchpad shared across agents in a pipeline run. Lives in
 * memory for the lifetime of the run; the engine snapshots `snapshot()`
 * onto the episode at completeRun time.
 *
 * Intentionally simple — three Maps and a notes array. Crash-safety is
 * deferred (the snapshot only persists at the end of the run). For ~50
 * demos at solo-founder pace this is acceptable; a real-time per-set
 * SQLite write can be layered on later if needed.
 */
export class InMemoryWorkingMemory implements WorkingMemory {
  private readonly shared = new Map<string, unknown>();
  private readonly agentScoped = new Map<string, unknown>();
  private readonly notes: WorkingMemoryNote[] = [];

  constructor(public readonly runId: string) {}

  set(key: string, value: unknown): void {
    this.shared.set(key, value);
  }

  get<T = unknown>(key: string): T | undefined {
    return this.shared.get(key) as T | undefined;
  }

  setForAgent(agentId: string, key: string, value: unknown): void {
    this.agentScoped.set(`${agentId}/${key}`, value);
  }

  getFromAgent(agentId: string, key: string): unknown {
    return this.agentScoped.get(`${agentId}/${key}`);
  }

  addNote(note: string, author: string): void {
    this.notes.push({ note, author, timestamp: new Date().toISOString() });
  }

  getNotes(): WorkingMemoryNote[] {
    return [...this.notes];
  }

  snapshot(): Record<string, unknown> {
    const shared: Record<string, unknown> = {};
    for (const [k, v] of this.shared) shared[k] = v;
    const scoped: Record<string, unknown> = {};
    for (const [k, v] of this.agentScoped) scoped[k] = v;
    return { shared, agentScoped: scoped, notes: [...this.notes] };
  }

  /** Convenience for tests / agents that run outside a pipeline. */
  static empty(runId = "anonymous"): InMemoryWorkingMemory {
    return new InMemoryWorkingMemory(runId);
  }
}
