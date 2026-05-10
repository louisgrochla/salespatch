import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { decisionStore } from "./decisionStore";
import { episodicStore } from "./episodicStore";
import { attributionEngine } from "./attributionEngine";
import type {
  OutcomeIngestPayload,
  OutcomeIngestResult,
  OutcomeKind,
  OutcomeSource,
} from "./types";

export interface IngestLogEntry {
  external_id: string;
  source: OutcomeSource;
  payload: OutcomeIngestPayload;
  matched_decisions: number;
  match_strategy: OutcomeIngestResult["match_strategy"];
  episode_id?: string;
  ingested_at: string;
}

/**
 * Idempotent outcome ingester. Ported from src/learning/outcomeIngest.ts.
 *
 * Flow:
 *   1. Check outcome_ingest_log for external_id → skip if duplicate
 *   2. Match decisions by lead_id tag (preferred) or business_name + 30-day
 *      window fallback
 *   3. Write outcome row per matched decision
 *   4. Mirror onto matching episode (attachOutcome)
 *   5. Compute attribution
 *   6. Persist outcome_ingest_log row (with first matched episode_id)
 *
 * All-or-nothing per ingest: wrapped in a Prisma transaction so partial
 * writes can't drift if the request gets killed mid-way.
 */
export const outcomeIngester = {
  async alreadySeen(externalId: string): Promise<boolean> {
    const row = await prisma.outcomeIngestLog.findUnique({
      where: { externalId },
      select: { externalId: true },
    });
    return row !== null;
  },

  async ingest(payload: OutcomeIngestPayload): Promise<OutcomeIngestResult> {
    if (await outcomeIngester.alreadySeen(payload.external_id)) {
      return {
        external_id: payload.external_id,
        matched_decisions: 0,
        match_strategy: "none",
        skipped_reason: "duplicate",
      };
    }

    // Match decisions
    let decisions: Array<{ id: string; run_id: string; created_at: string }>;
    let matchStrategy: OutcomeIngestResult["match_strategy"];

    if (payload.lead_id) {
      const list = await decisionStore.listDecisionsByLeadId(payload.lead_id);
      decisions = list.map((d) => ({
        id: d.id,
        run_id: d.run_id,
        created_at: d.created_at,
      }));
      matchStrategy = decisions.length > 0 ? "lead_id" : "none";
    } else if (payload.business_name) {
      decisions = await matchByBusinessNameAndDate(
        payload.business_name,
        payload.occurred_at,
      );
      matchStrategy = decisions.length > 0 ? "business_name_date" : "none";
    } else {
      decisions = [];
      matchStrategy = "none";
    }

    const matchedLeadId = payload.lead_id ?? (await inferLeadIdFromDecisions(decisions));

    // Write outcomes + attach to episodes
    const occurredAtMs = Date.parse(payload.occurred_at);
    const episodeIdsTouched = new Set<string>();
    let firstEpisodeId: string | undefined;

    for (const d of decisions) {
      const lagHours = Number.isFinite(occurredAtMs)
        ? Math.max(0, (occurredAtMs - Date.parse(d.created_at)) / 3_600_000)
        : undefined;
      await decisionStore.recordOutcome({
        decision_id: d.id,
        outcome_type: payload.outcome_type,
        result: payload.result,
        metric_value: payload.agreed_price_gbp,
        metric_name: payload.agreed_price_gbp != null ? "agreed_price_gbp" : undefined,
        notes: formatNotes(payload),
        lag_hours: lagHours,
      });

      if (d.run_id && !episodeIdsTouched.has(d.run_id)) {
        episodeIdsTouched.add(d.run_id);
        const updated = await episodicStore.attachOutcome(d.run_id, {
          pitch_outcome: mapOutcomeKindToEpisode(payload.outcome_type),
          close_amount_gbp: payload.agreed_price_gbp,
          outcome_notes: formatNotes(payload),
        });
        if (updated && !firstEpisodeId) firstEpisodeId = updated.id;
      }
    }

    // Persist ingest log row regardless of match outcome — atomic with the
    // outcomes/episodes writes via Prisma single-statement insertion.
    await prisma.outcomeIngestLog.create({
      data: {
        externalId: payload.external_id,
        source: payload.source,
        payload: payload as unknown as Prisma.InputJsonValue,
        matchedDecisions: decisions.length,
        matchStrategy: matchStrategy,
        episodeId: firstEpisodeId ?? null,
      },
    });

    // Compute attribution. Errors logged but never raised.
    if (decisions.length > 0) {
      try {
        await attributionEngine.attributePending();
      } catch (e) {
        console.warn("[outcome-ingest] attribution failed", String(e));
      }
    }

    return {
      external_id: payload.external_id,
      matched_decisions: decisions.length,
      matched_lead_id: matchedLeadId ?? undefined,
      match_strategy: matchStrategy,
      skipped_reason: decisions.length === 0 ? "no_match" : undefined,
    };
  },

  async listRecent(limit = 50): Promise<IngestLogEntry[]> {
    const rows = await prisma.outcomeIngestLog.findMany({
      orderBy: { ingestedAt: "desc" },
      take: limit,
    });
    return rows.map((r) => ({
      external_id: r.externalId,
      source: r.source as OutcomeSource,
      payload: r.payload as unknown as OutcomeIngestPayload,
      matched_decisions: r.matchedDecisions,
      match_strategy: r.matchStrategy as OutcomeIngestResult["match_strategy"],
      episode_id: r.episodeId ?? undefined,
      ingested_at: r.ingestedAt.toISOString(),
    }));
  },
};

// ── Helpers ──

async function matchByBusinessNameAndDate(
  businessName: string,
  occurredAt: string,
): Promise<Array<{ id: string; run_id: string; created_at: string }>> {
  const slug = businessName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const occurred = Date.parse(occurredAt);
  const windowMs = 30 * 24 * 60 * 60 * 1000;

  const candidates = await prisma.decision.findMany({
    where: {
      OR: [
        { tags: { hasSome: [slug] } }, // long-shot, in case slug is in tags
        { inputsSummary: { contains: businessName } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return candidates
    .filter((c) => {
      const created = c.createdAt.getTime();
      return Math.abs(occurred - created) <= windowMs;
    })
    .map((c) => ({
      id: c.id,
      run_id: c.runId,
      created_at: c.createdAt.toISOString(),
    }));
}

async function inferLeadIdFromDecisions(
  decisions: Array<{ id: string; run_id: string; created_at: string }>,
): Promise<string | undefined> {
  if (decisions.length === 0) return undefined;
  const first = await decisionStore.getDecision(decisions[0].id);
  const tag = first?.tags.find((t) => t.startsWith("lead_id:"));
  return tag ? tag.slice("lead_id:".length) : undefined;
}

function formatNotes(payload: OutcomeIngestPayload): string {
  const parts: string[] = [];
  if (payload.demo_reaction) parts.push(`reaction: ${payload.demo_reaction}`);
  if (payload.interest_level) parts.push(`interest: ${payload.interest_level}`);
  if (payload.objections?.length)
    parts.push(`objections: ${payload.objections.join(", ")}`);
  if (payload.notes) parts.push(payload.notes);
  return parts.join(" | ") || `${payload.source}:${payload.outcome_type}`;
}

function mapOutcomeKindToEpisode(
  kind: OutcomeKind,
): "closed" | "rejected" | "follow_up" | "no_outcome" {
  switch (kind) {
    case "pitch_closed":
      return "closed";
    case "pitch_rejected":
      return "rejected";
    case "pitch_followup":
      return "follow_up";
    default:
      return "no_outcome";
  }
}
