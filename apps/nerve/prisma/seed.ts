// Idempotent seeder. Safe to re-run.
//
// Seeds:
//  - PhaseBoundary rows (Phase 1 minimum — others added as the project
//    moves through its methodology timeline)
//  - DissertationMeta singleton (id = "main")
//
// Run via: `npm run db:seed` (which calls `tsx prisma/seed.ts`).

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface PhaseSeed {
  name: string;
  startDate: Date;
  endDate: Date | null;
  operationalDescription: string;
}

const PHASES: PhaseSeed[] = [
  {
    name: "Phase 1",
    startDate: new Date("2026-05-01"),
    endDate: null,
    operationalDescription:
      "Manual beta. Leads sourced via Claude, demos hand-built, " +
      "salespeople pitching live businesses in Aberdeen.",
  },
];

async function main() {
  for (const p of PHASES) {
    await prisma.phaseBoundary.upsert({
      where: { name: p.name },
      create: p,
      update: {
        startDate: p.startDate,
        endDate: p.endDate,
        operationalDescription: p.operationalDescription,
      },
    });
    console.log(`✓ phase: ${p.name}`);
  }

  await prisma.dissertationMeta.upsert({
    where: { id: "main" },
    create: {
      id: "main",
      workingTitle:
        "Evaluating an AI-powered self-learning multi-agent sales platform " +
        "as a vehicle for sustainable distributed income across a public " +
        "contractor network",
      researchQuestion:
        "Can an AI-powered self-learning multi-agent sales platform " +
        "generate sustainable distributed income across a public contractor " +
        "network?",
      supervisor: null,
      submissionDeadline: null,
      phaseLabel: "Phase 1",
    },
    update: {},
  });
  console.log(`✓ dissertation meta`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
