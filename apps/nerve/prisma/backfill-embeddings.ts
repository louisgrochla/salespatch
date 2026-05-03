// Backfill embeddings for records that were saved while
// OPENAI_API_KEY was unset (dev mode). Idempotent — safe to re-run.
//
// Run: `npm run db:backfill-embeddings`
//
// Walks each embeddable table, finds rows with no Embedding row, and
// re-embeds them. Per-row failures are logged and skipped so one bad
// record can't halt the whole job.

import { PrismaClient } from "@prisma/client";
import { embedRecord, embedText } from "../src/lib/embeddings";

const prisma = new PrismaClient();

interface BackfillTarget {
  sourceType: string;
  fetchMissing: () => Promise<Array<{ id: string; phaseLabel: string; data: Record<string, unknown> }>>;
  mode: "record" | "text";
  textKey?: string;
  metadata?: (row: Record<string, unknown>) => Record<string, unknown>;
}

const TARGETS: BackfillTarget[] = [
  {
    sourceType: "PitchLog",
    mode: "record",
    fetchMissing: async () => {
      const rows = await prisma.$queryRaw<Array<{ id: string; phaseLabel: string }>>`
        SELECT p."id", p."phaseLabel"
        FROM "PitchLog" p
        LEFT JOIN "Embedding" e
          ON e."sourceType" = 'PitchLog' AND e."sourceId" = p."id"
        WHERE e."id" IS NULL
      `;
      const full = await Promise.all(
        rows.map((r) =>
          prisma.pitchLog.findUnique({ where: { id: r.id } }).then((p) => ({
            id: r.id,
            phaseLabel: r.phaseLabel,
            data: p as unknown as Record<string, unknown>,
          })),
        ),
      );
      return full;
    },
    metadata: (r) => ({
      section: "sales",
      contentType: "pitch",
      sector: r.sector,
      businessType: r.businessType,
      outcome: r.outcome,
      contractorId: r.contractorId,
      leadSource: r.leadSource,
      demoVersion: r.demoVersion,
    }),
  },
];

async function main() {
  let total = 0;
  for (const t of TARGETS) {
    const rows = await t.fetchMissing();
    console.log(`${t.sourceType}: ${rows.length} missing`);
    for (const row of rows) {
      try {
        if (t.mode === "record") {
          const { id, phaseLabel, ...rest } = row.data as Record<string, unknown> & {
            id: string; phaseLabel: string;
          };
          await embedRecord(
            { sourceType: t.sourceType, sourceId: row.id, phaseLabel: row.phaseLabel,
              metadata: t.metadata?.(row.data) ?? {} },
            rest as Record<string, string | number | boolean | Date | null | undefined>,
          );
        } else if (t.mode === "text" && t.textKey) {
          const text = String((row.data as Record<string, unknown>)[t.textKey] ?? "");
          await embedText(
            { sourceType: t.sourceType, sourceId: row.id, phaseLabel: row.phaseLabel,
              metadata: t.metadata?.(row.data) ?? {} },
            text,
          );
        }
        total++;
        if (total % 25 === 0) console.log(`  ... ${total} embedded`);
      } catch (e) {
        console.error(`  ✗ ${t.sourceType}/${row.id}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }
  console.log(`✓ done — ${total} embedded`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
