// Placeholder type definitions populated incrementally:
//   - WorkingMemory ships in Phase 4 (src/runtime/workingMemory.ts)
//   - StrategyEntry ships in Phase 7 (src/memory/strategicStore.ts)
//   - CriticEvaluation ships in Phase 3 (src/evaluation/heuristicCritic.ts)
//
// Defined here so AgentExecutionInput can reference them without circular
// imports. The interfaces are deliberately minimal — concrete shapes are
// owned by the modules that implement them.

export interface WorkingMemoryNote {
  note: string;
  author: string;
  timestamp: string;
}

export interface WorkingMemory {
  readonly runId: string;
  set(key: string, value: unknown): void;
  get<T = unknown>(key: string): T | undefined;
  setForAgent(agentId: string, key: string, value: unknown): void;
  getFromAgent(agentId: string, key: string): unknown;
  addNote(note: string, author: string): void;
  getNotes(): WorkingMemoryNote[];
  snapshot(): Record<string, unknown>;
}

export interface StrategyEntry {
  id: string;
  vertical: string;
  region?: string;
  strategy_type: string;
  parameters: Record<string, unknown>;
  sample_size: number;
  close_rate: number | null;
  status: "new" | "testing" | "active" | "champion" | "deprecated";
}

export interface CriticEvaluation {
  score: number;
  prediction: "likely_close" | "unlikely_close" | "uncertain";
  critique: {
    strengths: string[];
    weaknesses: string[];
    specific_suggestions: string[];
  };
  confidence: number;
  model_version: string;
}
