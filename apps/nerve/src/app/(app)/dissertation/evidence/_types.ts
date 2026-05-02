// Whitelist of source types — any sourceType outside this list is
// rejected when creating evidence so the polymorphic table can't end up
// referencing tables we never plan to support.

export const EVIDENCE_SOURCE_TYPES = [
  "PitchLog",
  "OperationsLog",
  "RevenueEntry",
  "CostEntry",
  "DemoRecord",
  "LeadRecord",
  "LiteratureEntry",
  "PromptLibraryEntry",
  "ArchitectureDocument",
  "PhaseBoundary",
] as const;

export type EvidenceSourceType = (typeof EVIDENCE_SOURCE_TYPES)[number];
