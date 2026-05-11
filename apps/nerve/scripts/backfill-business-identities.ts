/**
 * F1 — Backfill canonical BusinessIdentity rows from existing producer
 * tables (lead_profiles, site_briefs, demo_artefacts, lead_records,
 * lead_assignment_events).
 *
 * Idempotent. Re-running merges new lookups into existing rows via
 * businessIdentityStore.lookupOrCreate (normalised-name + postcode dedup).
 *
 *   npx tsx scripts/backfill-business-identities.ts            # apply
 *   npx tsx scripts/backfill-business-identities.ts --dry-run  # report only
 */

import { prisma } from "../src/lib/db";
import {
  businessIdentityStore,
  normaliseName,
  normalisePostcode,
} from "../src/lib/sl-mas/businessIdentityStore";

interface Candidate {
  source: string;
  preferred_slug?: string;
  business_name: string;
  postcode?: string | null;
  vertical?: string | null;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  // Gather candidates in priority order — slug-bearing producers first so
  // canonical slug adopts the existing skill-emitted slug when possible.
  const candidates: Candidate[] = [];

  const profiles = await prisma.leadProfile.findMany({
    select: {
      leadId: true,
      businessName: true,
      postcode: true,
      vertical: true,
    },
  });
  for (const p of profiles) {
    candidates.push({
      source: "lead_profiles",
      preferred_slug: p.leadId,
      business_name: p.businessName,
      postcode: p.postcode,
      vertical: p.vertical,
    });
  }

  const briefs = await prisma.siteBrief.findMany({
    select: {
      leadId: true,
      businessName: true,
      postcode: true,
      vertical: true,
    },
  });
  for (const b of briefs) {
    candidates.push({
      source: "site_briefs",
      preferred_slug: b.leadId,
      business_name: b.businessName,
      postcode: b.postcode,
      vertical: b.vertical,
    });
  }

  const demos = await prisma.demoArtefact.findMany({
    select: { leadId: true, businessName: true, vertical: true },
  });
  for (const d of demos) {
    candidates.push({
      source: "demo_artefacts",
      preferred_slug: d.leadId,
      business_name: d.businessName,
      vertical: d.vertical,
    });
  }

  const leads = await prisma.leadRecord.findMany({
    select: { name: true, sector: true, location: true },
  });
  for (const l of leads) {
    candidates.push({
      source: "lead_records",
      business_name: l.name,
      vertical: l.sector,
      postcode: extractPostcodeFromLocation(l.location),
    });
  }

  // Stats
  const seen = new Map<string, { count: number; sources: Set<string> }>();
  for (const c of candidates) {
    const key = `${normaliseName(c.business_name)}|${normalisePostcode(c.postcode) ?? ""}`;
    const entry = seen.get(key) ?? { count: 0, sources: new Set<string>() };
    entry.count += 1;
    entry.sources.add(c.source);
    seen.set(key, entry);
  }

  console.log(`Candidates: ${candidates.length} rows across producer tables`);
  console.log(`Unique businesses (post-normalisation): ${seen.size}`);
  console.log("");

  if (dryRun) {
    const overlaps = Array.from(seen.entries()).filter(
      ([, v]) => v.sources.size > 1,
    );
    console.log(
      `Cross-producer overlaps (same business, multiple sources): ${overlaps.length}`,
    );
    for (const [key, v] of overlaps.slice(0, 20)) {
      console.log(`  ${key} → ${Array.from(v.sources).join(", ")}`);
    }
    console.log("(dry-run: no rows written)");
    return;
  }

  let created = 0;
  let merged = 0;
  const beforeCount = await prisma.businessIdentity.count();

  for (const c of candidates) {
    const before = await prisma.businessIdentity.count();
    await businessIdentityStore.lookupOrCreate({
      business_name: c.business_name,
      postcode: c.postcode,
      vertical: c.vertical,
      preferred_slug: c.preferred_slug,
    });
    const after = await prisma.businessIdentity.count();
    if (after > before) created += 1;
    else merged += 1;
  }

  const afterCount = await prisma.businessIdentity.count();
  console.log(`BusinessIdentity rows: ${beforeCount} → ${afterCount}`);
  console.log(`Created: ${created} · Merged: ${merged}`);
}

/**
 * LeadRecord.location is free text ("Aberdeen, AB15 8QA", "Rosemount",
 * etc). Best-effort UK postcode extraction — letters/digits pattern at
 * the end of the string. Returns null on no match.
 */
function extractPostcodeFromLocation(loc: string | null): string | null {
  if (!loc) return null;
  const match = loc.match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/i);
  return match ? match[0] : null;
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
