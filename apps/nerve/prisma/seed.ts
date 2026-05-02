// Idempotent seeder. Safe to re-run after every schema change.
//
// Owns the canonical research metadata: PhaseBoundary, DissertationMeta
// (with version histories), DissertationSection structure, MethodologyDoc
// for Phase 1, AcademicCalendarItem milestones.
//
// Operational data (pitches, operations log, financial entries) is NOT
// seeded here — that flows in via the iOS webhook or manual entry.
//
// Run via: `npm run db:seed`

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const WORKING_TITLE =
  "Distributed AI-Augmented Sales: Can a Self-Learning Multi-Agent " +
  "Platform Produce Sustainable Income Across a Non-Technical " +
  "Contractor Network?";

const RESEARCH_QUESTION =
  "Can a self-learning, AI-augmented multi-agent sales platform " +
  "generate sustainable distributed income across a network of " +
  "non-technical contractors, and what factors determine commercial " +
  "viability across pre-launch, automated, and public deployment phases?";

const ACADEMIC_FRAMING =
  "This study evaluates the commercial viability of an AI-augmented " +
  "distributed sales platform through quantitative analysis of conversion " +
  "data across three distinct operational phases. It does not presuppose " +
  "commercial success — it seeks to identify the conditions necessary for " +
  "sustainable income generation, and the barriers that prevent it, using " +
  "primary data collected from a live platform during its development and " +
  "launch period.";

const DEGREE_RELEVANCE_MARKETING = [
  "AI-augmented outreach and personalisation at scale",
  "Bespoke demo websites as digital marketing assets",
  "SME digital adoption and local market penetration",
  "Conversion optimisation across a distributed sales network",
  "Hyper-personalised digital marketing delivered at volume",
].map((b) => `- ${b}`).join("\n");

const DEGREE_RELEVANCE_ANALYTICS = [
  "Conversion rate analysis across operational phases",
  "Customer acquisition cost and lifetime value modelling",
  "Statistical significance testing on close rate differentials",
  "Predictive revenue modelling from accumulated pitch data",
  "Platform sustainability metrics and ROI analysis",
].map((b) => `- ${b}`).join("\n");

const PHASE_1_DESCRIPTION =
  "Manual beta. Manually sourced leads, hand-built demos, " +
  "human-operated sales network. Establishes baseline conversion rate " +
  "without automation. Minimum target: 50 clean pitch records.";

const METHODOLOGY_FORMAL =
  "This study is a mixed-methods longitudinal evaluation of the SL-MAS " +
  "platform across three operational phases. Phase 1 (manual beta, " +
  "starting May 2026) establishes a baseline conversion rate using " +
  "manually sourced leads, hand-built demos, and human-operated sales. " +
  "Phase 2 (automated pipeline, mid-2026) replaces lead generation and " +
  "demo construction with AI-driven processes; the same contractor " +
  "network and target market are retained so the comparison isolates " +
  "automation efficiency. Phase 3 (public launch, mid-Year 4) opens the " +
  "platform to public contractor sign-ups to test whether the model " +
  "holds at scale beyond the founding cohort. The research question is " +
  "answerable from Phase 1 and Phase 2 data alone; Phase 3 provides " +
  "additional depth but is not a dependency for a valid submission.";

const METHODOLOGY_MIXED_JUSTIFICATION =
  "Quantitative pitch outcomes (conversion rates, customer acquisition " +
  "cost, deal value, time efficiency) are combined with qualitative " +
  "contractor questionnaire responses, objection patterns, operational " +
  "log entries, and decision/failure logs. The two streams are necessary " +
  "in combination: quantitative data establishes whether the platform " +
  "produces sustainable income, qualitative data establishes why it does " +
  "or does not.";

const METHODOLOGY_SAMPLE =
  "A minimum of 50 pitch records per phase is set as the threshold for " +
  "findings-grade analysis, drawing on Cohen (1992) for small-effect-size " +
  "detection in proportional outcomes. Phases with fewer than 50 records " +
  "will be reported with explicit confidence caveats and excluded from " +
  "primary statistical comparisons.";

const METHODOLOGY_STATS =
  "Close-rate proportions per phase, sector, business type, lead source, " +
  "and demo version are compared using two-tailed z-tests for " +
  "proportions. Objection frequencies are tallied with chi-square " +
  "independence tests against outcome. Customer acquisition cost is " +
  "computed per phase as total cost / closed deals. Confidence intervals " +
  "and p-values are reported alongside every comparison.";

const METHODOLOGY_GDPR =
  "Lawful basis for personal data processing is consent, captured per " +
  "pitch via the iOS application and stored on the PitchLog row. " +
  "Personal data is limited to business name, location, contractor " +
  "identifier, and free-text notes. Contractor identifiers are " +
  "anonymised in any external reporting. Retention: 7 years for the " +
  "dissertation evidence base; deletable on request.";

const METHODOLOGY_NERVE =
  "Operational data is captured continuously through NERVE — a " +
  "founder-only intranet that ingests pitch records via a Supabase " +
  "webhook the moment a contractor logs them in the iOS application. " +
  "Every record is timestamped with the active phase label, written to " +
  "a Postgres database, and immediately chunked and embedded into " +
  "pgvector for retrieval. Manual entries (operations log, decisions, " +
  "financial records, literature, evidence) follow the same pipeline. " +
  "NERVE thus serves as both a real-time operational tool and the " +
  "primary research instrument for this study; its design and operation " +
  "are themselves part of the methodology.";

const SECTIONS: { chapter: string; target: number }[] = [
  { chapter: "Introduction", target: 1500 },
  { chapter: "Literature Review", target: 3000 },
  { chapter: "Methodology", target: 2000 },
  { chapter: "Findings", target: 2500 },
  { chapter: "Discussion", target: 2000 },
  { chapter: "Conclusion", target: 1000 },
];

const CALENDAR: { milestone: string; deadline: Date; status: string }[] = [
  { milestone: "Confirm submission deadline (module handbook)", deadline: new Date("2025-09-30"), status: "pending" },
  { milestone: "Confirm word-count limit (module handbook)", deadline: new Date("2025-09-30"), status: "pending" },
  { milestone: "Supervisor allocation confirmed", deadline: new Date("2026-09-30"), status: "pending" },
  { milestone: "Ethics approval submitted", deadline: new Date("2026-11-01"), status: "pending" },
  { milestone: "Literature review first draft", deadline: new Date("2026-12-15"), status: "pending" },
  { milestone: "Phase 2 (automated pipeline) target start", deadline: new Date("2026-09-01"), status: "pending" },
  { milestone: "Methodology chapter draft", deadline: new Date("2027-01-15"), status: "pending" },
  { milestone: "Phase 3 (public launch) target start", deadline: new Date("2027-02-01"), status: "pending" },
];

async function main() {
  // ── PhaseBoundary ──────────────────────────────────────────────────
  await prisma.phaseBoundary.upsert({
    where: { name: "Phase 1" },
    create: {
      name: "Phase 1",
      startDate: new Date("2026-05-01"),
      endDate: null,
      operationalDescription: PHASE_1_DESCRIPTION,
    },
    update: { operationalDescription: PHASE_1_DESCRIPTION },
  });
  console.log("✓ phase: Phase 1");

  // ── DissertationMeta ───────────────────────────────────────────────
  const existing = await prisma.dissertationMeta.findUnique({ where: { id: "main" } });
  const titleChanged = !existing || existing.workingTitle !== WORKING_TITLE;
  const rqChanged = !existing || existing.researchQuestion !== RESEARCH_QUESTION;

  await prisma.dissertationMeta.upsert({
    where: { id: "main" },
    create: {
      id: "main",
      workingTitle: WORKING_TITLE,
      researchQuestion: RESEARCH_QUESTION,
      supervisor: null,
      submissionDeadline: null,
      submissionDeadlineNote: "End of Year 4 academic year — exact deadline to be confirmed September 2025.",
      overallStatus: "in_progress",
      degree: "BA (Hons) Digital Marketing and Business Analytics",
      institution: "Robert Gordon University, Aberdeen",
      wordCountTargetMin: 10000,
      wordCountTargetMax: 12000,
      academicFraming: ACADEMIC_FRAMING,
      degreeRelevanceMarketing: DEGREE_RELEVANCE_MARKETING,
      degreeRelevanceAnalytics: DEGREE_RELEVANCE_ANALYTICS,
      phaseLabel: "Phase 1",
    },
    update: {
      workingTitle: WORKING_TITLE,
      researchQuestion: RESEARCH_QUESTION,
      submissionDeadlineNote: "End of Year 4 academic year — exact deadline to be confirmed September 2025.",
      degree: "BA (Hons) Digital Marketing and Business Analytics",
      institution: "Robert Gordon University, Aberdeen",
      wordCountTargetMin: 10000,
      wordCountTargetMax: 12000,
      academicFraming: ACADEMIC_FRAMING,
      degreeRelevanceMarketing: DEGREE_RELEVANCE_MARKETING,
      degreeRelevanceAnalytics: DEGREE_RELEVANCE_ANALYTICS,
    },
  });

  if (titleChanged) {
    await prisma.workingTitleVersion.create({
      data: { dissertationId: "main", value: WORKING_TITLE },
    });
  }
  if (rqChanged) {
    await prisma.researchQuestionVersion.create({
      data: { dissertationId: "main", value: RESEARCH_QUESTION },
    });
  }
  console.log("✓ dissertation meta");

  // ── DissertationSection ────────────────────────────────────────────
  // Six exact chapters per the latest research spec. Word count targets
  // sum to 12,000 (top of the 10k–12k range).
  for (const s of SECTIONS) {
    await prisma.dissertationSection.upsert({
      where: { chapter: s.chapter },
      create: {
        chapter: s.chapter,
        content: "",
        status: "not_started",
        wordCountTarget: s.target,
        wordCount: 0,
        phaseLabel: "Phase 1",
      },
      update: { wordCountTarget: s.target },
    });
  }
  // Drop any chapter we previously seeded that is NOT in the new list,
  // but only if it has no content (preserves any in-progress writing).
  const keep = new Set(SECTIONS.map((s) => s.chapter));
  const orphans = await prisma.dissertationSection.findMany({
    where: { chapter: { notIn: Array.from(keep) }, content: "" },
  });
  for (const o of orphans) {
    await prisma.embedding.deleteMany({
      where: { sourceType: "DissertationSection", sourceId: o.id },
    });
    await prisma.dissertationSection.delete({ where: { id: o.id } });
    console.log(`✗ removed obsolete chapter (empty): ${o.chapter}`);
  }
  console.log(`✓ sections (${SECTIONS.length})`);

  // ── MethodologyDoc for Phase 1 ─────────────────────────────────────
  const existingMeth = await prisma.methodologyDoc.findFirst({
    where: { phaseName: "Phase 1" },
  });
  const methData = {
    phaseName: "Phase 1",
    formalDescription: METHODOLOGY_FORMAL,
    mixedMethodsJustification: METHODOLOGY_MIXED_JUSTIFICATION,
    sampleSizeNotes: METHODOLOGY_SAMPLE,
    statisticalApproach: METHODOLOGY_STATS,
    gdprHandling: METHODOLOGY_GDPR,
    nerveAsInfrastructure: METHODOLOGY_NERVE,
    phaseLabel: "Phase 1",
  };
  if (existingMeth) {
    await prisma.methodologyDoc.update({ where: { id: existingMeth.id }, data: methData });
  } else {
    await prisma.methodologyDoc.create({ data: methData });
  }
  console.log("✓ methodology: Phase 1");

  // ── AcademicCalendar ───────────────────────────────────────────────
  for (const c of CALENDAR) {
    const existingItem = await prisma.academicCalendarItem.findFirst({
      where: { milestone: c.milestone },
    });
    if (existingItem) {
      await prisma.academicCalendarItem.update({
        where: { id: existingItem.id },
        data: { deadline: c.deadline, status: c.status },
      });
    } else {
      await prisma.academicCalendarItem.create({
        data: { ...c, phaseLabel: "Phase 1" },
      });
    }
  }
  console.log(`✓ calendar (${CALENDAR.length})`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
