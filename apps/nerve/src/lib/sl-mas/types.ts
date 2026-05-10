// Shared types for the NERVE-side SL-MAS data layer.
// Ported from src/runtime/types.ts on the runtime side. Kept narrow —
// concrete shapes belong with the modules that own them.

export interface WorkingMemoryNote {
  note: string;
  author: string;
  timestamp: string;
}

export interface WorkingMemorySnapshot {
  shared: Record<string, unknown>;
  agentScoped: Record<string, unknown>;
  notes: WorkingMemoryNote[];
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

export interface PivotResult {
  group_key: Record<string, string>;
  sample_size: number;
  closed: number;
  rejected: number;
  pending: number;
  close_rate: number;
}

export type StrategyStatus =
  | "new"
  | "testing"
  | "active"
  | "champion"
  | "deprecated";

export type OutcomeSource =
  | "nerve_webhook"
  | "supabase_poll"
  | "manual_skill"
  | "test";

export type OutcomeKind =
  | "pitch_closed"
  | "pitch_rejected"
  | "pitch_followup"
  | "demo_viewed"
  | "no_outcome";

export interface OutcomeIngestPayload {
  source: OutcomeSource;
  external_id: string;
  lead_id?: string;
  business_name?: string;
  outcome_type: OutcomeKind;
  result: "positive" | "negative" | "neutral";
  agreed_price_gbp?: number;
  interest_level?: "cold" | "warm" | "hot";
  demo_reaction?: "loved" | "liked" | "neutral" | "unimpressed";
  objections?: string[];
  notes?: string;
  occurred_at: string;
  pitch_log_id?: string;
  assignment_id?: string;
}

export interface OutcomeIngestResult {
  external_id: string;
  matched_decisions: number;
  matched_lead_id?: string;
  match_strategy: "lead_id" | "business_name_date" | "none";
  skipped_reason?: "duplicate" | "no_match";
}
