// Backfill embeddings for records that were saved while
// OPENAI_API_KEY was unset (dev mode, or production before the key
// was added). Idempotent — safe to re-run.
//
// Run: `npm run db:backfill-embeddings`
//
// Walks each embeddable table, finds rows with no Embedding row, and
// re-embeds them. Per-row failures are logged and skipped so one bad
// record can't halt the whole job.
//
// Each TARGET mirrors its live-ingest-route counterpart's `embedRecord`
// call exactly (same metadata keys, same selective field extraction).
// When you change a live route's embed shape, change the matching
// TARGET here too — otherwise backfilled chunks drift from live ones.

import { PrismaClient } from "@prisma/client";
import { embedRecord } from "../src/lib/embeddings";
import { phaseLabelFor } from "../src/lib/phase";
import { siteBriefStore } from "../src/lib/sl-mas/siteBriefStore";
import { brandAnalysisStore } from "../src/lib/sl-mas/brandAnalysisStore";
import { demoArtefactStore } from "../src/lib/sl-mas/demoArtefactStore";
import { qaVisualResultStore } from "../src/lib/sl-mas/qaVisualResultStore";

const prisma = new PrismaClient();

interface BackfillTarget {
  sourceType: string;
  run: () => Promise<number>;
}

function pickString(
  obj: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  if (!obj) return null;
  const v = obj[key];
  return typeof v === "string" ? v : null;
}

const TARGETS: BackfillTarget[] = [
  {
    sourceType: "PitchLog",
    run: async () => {
      const rows = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT p."id"
        FROM "PitchLog" p
        LEFT JOIN "Embedding" e
          ON e."sourceType" = 'PitchLog' AND e."sourceId" = p."id"
        WHERE e."id" IS NULL
      `;
      let n = 0;
      for (const { id } of rows) {
        try {
          const p = await prisma.pitchLog.findUnique({ where: { id } });
          if (!p) continue;
          const { id: _id, phaseLabel, ...rest } = p as unknown as Record<
            string,
            unknown
          > & { id: string; phaseLabel: string };
          await embedRecord(
            {
              sourceType: "PitchLog",
              sourceId: id,
              phaseLabel,
              metadata: {
                section: "sales",
                contentType: "pitch",
                sector: (p as Record<string, unknown>).sector,
                businessType: (p as Record<string, unknown>).businessType,
                outcome: (p as Record<string, unknown>).outcome,
                contractorId: (p as Record<string, unknown>).contractorId,
                leadSource: (p as Record<string, unknown>).leadSource,
                demoVersion: (p as Record<string, unknown>).demoVersion,
              },
            },
            rest as Record<
              string,
              string | number | boolean | Date | null | undefined
            >,
          );
          n++;
        } catch (e) {
          console.error(
            `  ✗ PitchLog/${id}: ${e instanceof Error ? e.message : e}`,
          );
        }
      }
      return n;
    },
  },
  {
    sourceType: "SiteBrief",
    run: async () => {
      // Use the natural key (briefId) so we can reuse siteBriefStore.getById
      // and inherit its snake_case row shape — matches what /api/ingest/
      // site-brief sends to embedRecord at write time.
      const rows = await prisma.$queryRaw<
        Array<{ id: string; briefId: string; generatedAt: Date }>
      >`
        SELECT s."id", s."briefId", s."generatedAt"
        FROM "SiteBrief" s
        LEFT JOIN "Embedding" e
          ON e."sourceType" = 'SiteBrief' AND e."sourceId" = s."id"
        WHERE e."id" IS NULL
      `;
      let n = 0;
      for (const { id, briefId, generatedAt } of rows) {
        try {
          const row = await siteBriefStore.getById(briefId);
          if (!row) continue;
          const meta = (row.metadata ?? {}) as Record<string, unknown>;
          await embedRecord(
            {
              sourceType: "SiteBrief",
              sourceId: id,
              phaseLabel: await phaseLabelFor(new Date(generatedAt)),
              metadata: {
                section: "site-brief",
                leadId: row.lead_id,
                briefId: row.brief_id,
              },
            },
            {
              business_name: row.business_name,
              business_type: row.business_type ?? null,
              vertical: row.vertical ?? null,
              verdict: row.verdict,
              verdict_reason: row.verdict_reason ?? null,
              diagnosis: row.diagnosis ?? null,
              pitch_angle: row.pitch_angle ?? null,
              test_of_success: row.test_of_success ?? null,
              verdict_reasoning_trace:
                typeof meta.verdict_reasoning_trace === "string"
                  ? meta.verdict_reasoning_trace
                  : null,
              diagnosis_alternatives_considered: Array.isArray(
                meta.diagnosis_alternatives_considered,
              )
                ? JSON.stringify(meta.diagnosis_alternatives_considered)
                : null,
            },
          );
          n++;
        } catch (e) {
          console.error(
            `  ✗ SiteBrief/${id}: ${e instanceof Error ? e.message : e}`,
          );
        }
      }
      return n;
    },
  },
  {
    sourceType: "BrandAnalysis",
    run: async () => {
      const rows = await prisma.$queryRaw<
        Array<{ id: string; analysisId: string; analyzedAt: Date }>
      >`
        SELECT b."id", b."analysisId", b."analyzedAt"
        FROM "BrandAnalysis" b
        LEFT JOIN "Embedding" e
          ON e."sourceType" = 'BrandAnalysis' AND e."sourceId" = b."id"
        WHERE e."id" IS NULL
      `;
      let n = 0;
      for (const { id, analysisId, analyzedAt } of rows) {
        try {
          const row = await brandAnalysisStore.getById(analysisId);
          if (!row) continue;
          const meta = (row.metadata ?? {}) as Record<string, unknown>;
          const voiceQuotes = row.voice_quotes ?? [];
          const voiceAdjectives = row.voice_adjectives ?? [];
          const assetNotes = row.asset_notes ?? [];
          await embedRecord(
            {
              sourceType: "BrandAnalysis",
              sourceId: id,
              phaseLabel: await phaseLabelFor(new Date(analyzedAt)),
              metadata: {
                section: "brand-analysis",
                leadId: row.lead_id,
                analysisId: row.analysis_id,
              },
            },
            {
              logo_description: row.logo_description ?? null,
              logo_kind: row.logo_kind ?? null,
              voice_quotes:
                voiceQuotes.length > 0 ? voiceQuotes.join("\n") : null,
              voice_adjectives:
                voiceAdjectives.length > 0 ? voiceAdjectives.join(", ") : null,
              positioning_reference: row.positioning_reference ?? null,
              positioning_rationale: row.positioning_rationale ?? null,
              asset_notes:
                assetNotes.length > 0 ? assetNotes.join("\n") : null,
              positioning_alternatives_considered: Array.isArray(
                meta.positioning_alternatives_considered,
              )
                ? JSON.stringify(meta.positioning_alternatives_considered)
                : null,
            },
          );
          n++;
        } catch (e) {
          console.error(
            `  ✗ BrandAnalysis/${id}: ${e instanceof Error ? e.message : e}`,
          );
        }
      }
      return n;
    },
  },
  {
    sourceType: "DemoArtefact",
    run: async () => {
      const rows = await prisma.$queryRaw<
        Array<{ id: string; artefactId: string; generatedAt: Date }>
      >`
        SELECT d."id", d."artefactId", d."generatedAt"
        FROM "DemoArtefact" d
        LEFT JOIN "Embedding" e
          ON e."sourceType" = 'DemoArtefact' AND e."sourceId" = d."id"
        WHERE e."id" IS NULL
      `;
      let n = 0;
      for (const { id, artefactId, generatedAt } of rows) {
        try {
          const row = await demoArtefactStore.getById(artefactId);
          if (!row) continue;
          const meta = (row.metadata ?? {}) as Record<string, unknown>;
          const layoutDecisions =
            meta.layout_decisions && typeof meta.layout_decisions === "object"
              ? JSON.stringify(meta.layout_decisions)
              : null;
          const consult =
            meta.nerve_consult_summary &&
            typeof meta.nerve_consult_summary === "object"
              ? JSON.stringify(meta.nerve_consult_summary)
              : null;
          const designRationale =
            typeof meta.design_rationale === "string"
              ? meta.design_rationale
              : null;
          await embedRecord(
            {
              sourceType: "DemoArtefact",
              sourceId: id,
              phaseLabel: await phaseLabelFor(new Date(generatedAt)),
              metadata: {
                section: "demo-artefact",
                leadId: row.lead_id,
                artefactId: row.artefact_id,
              },
            },
            {
              business_name: row.business_name,
              vertical: row.vertical ?? null,
              aesthetic_positioning: row.aesthetic_positioning ?? null,
              dominant_hex: row.dominant_hex ?? null,
              photo_count: row.photo_count,
              design_rationale: designRationale,
              layout_decisions: layoutDecisions,
              nerve_consult_summary: consult,
            },
          );
          n++;
        } catch (e) {
          console.error(
            `  ✗ DemoArtefact/${id}: ${e instanceof Error ? e.message : e}`,
          );
        }
      }
      return n;
    },
  },
  {
    sourceType: "QaVisualResult",
    run: async () => {
      const rows = await prisma.$queryRaw<
        Array<{ id: string; qaVisualId: string; ranAt: Date }>
      >`
        SELECT q."id", q."qaVisualId", q."ranAt"
        FROM "QaVisualResult" q
        LEFT JOIN "Embedding" e
          ON e."sourceType" = 'QaVisualResult' AND e."sourceId" = q."id"
        WHERE e."id" IS NULL
      `;
      let n = 0;
      for (const { id, qaVisualId, ranAt } of rows) {
        try {
          const row = await qaVisualResultStore.getById(qaVisualId);
          if (!row) continue;
          const bugsText = Array.isArray(row.bugs)
            ? (row.bugs as Array<Record<string, unknown>>)
                .map((b) => {
                  const sev = typeof b.severity === "string" ? b.severity : "?";
                  const loc = typeof b.location === "string" ? b.location : "?";
                  const find = typeof b.finding === "string" ? b.finding : "";
                  return `[${sev}] ${loc} — ${find}`;
                })
                .join("\n")
            : null;
          const ownerReaction = row.owner_reaction
            ? JSON.stringify(row.owner_reaction)
            : null;
          const customerReaction = row.customer_reaction
            ? JSON.stringify(row.customer_reaction)
            : null;
          const brandFidelityNotes = pickString(
            row.brand_fidelity as Record<string, unknown> | null,
            "notes",
          );
          const voiceNotes = pickString(
            row.voice_consistency as Record<string, unknown> | null,
            "notes",
          );
          await embedRecord(
            {
              sourceType: "QaVisualResult",
              sourceId: id,
              phaseLabel: await phaseLabelFor(new Date(ranAt)),
              metadata: {
                section: "qa-visual",
                leadId: row.lead_id,
                qaVisualId: row.qa_visual_id,
                hasCritical: row.has_critical,
              },
            },
            {
              producer: row.producer,
              bug_count: row.bug_count,
              has_critical: row.has_critical,
              bugs: bugsText,
              owner_reaction: ownerReaction,
              customer_reaction: customerReaction,
              brand_fidelity_notes: brandFidelityNotes,
              voice_consistency_notes: voiceNotes,
              notes: row.notes ?? null,
            },
          );
          n++;
        } catch (e) {
          console.error(
            `  ✗ QaVisualResult/${id}: ${e instanceof Error ? e.message : e}`,
          );
        }
      }
      return n;
    },
  },
];

async function main() {
  let total = 0;
  for (const t of TARGETS) {
    process.stdout.write(`${t.sourceType}: `);
    const n = await t.run();
    console.log(`${n} embedded`);
    total += n;
  }
  console.log(`✓ done — ${total} embedded across ${TARGETS.length} tables`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
