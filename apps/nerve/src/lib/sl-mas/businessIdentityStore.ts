import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

// ── Wire-format types ────────────────────────────────────────────────────

export interface BusinessIdentityRow {
  id: string;
  slug: string;
  business_name: string;
  normalised_name: string;
  postcode: string | null;
  vertical: string | null;
  first_seen_at: string;
  last_seen_at: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface LookupInput {
  business_name: string;
  postcode?: string | null;
  vertical?: string | null;
  /** When the producer already has a slug it wants to preserve (e.g. the
   * /new-lead skill has scaffolded `~/Desktop/salespatch-demos/<slug>/`),
   * pass it here. If unique, the canonical row adopts it; otherwise the
   * store derives a fresh slug from the business name. */
  preferred_slug?: string;
}

// ── Normalisation primitives ─────────────────────────────────────────────

/**
 * Normalise a business name for dedup matching. Lowercase, drop diacritics,
 * ampersand→and, drop filler words (the/and), strip punctuation, collapse
 * whitespace.
 *
 *   "Noose & Needle"        → "noose needle"
 *   "The Bandit Bakery"     → "bandit bakery"
 *   "Mario's Deli & Café"   → "marios deli cafe"
 *
 * Slug variations ("noose-and-needle" vs "noose-needle") match because
 * filler words "and" / "the" are dropped after ampersand expansion.
 */
export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/['`’]/g, "") // contractions: mario's → marios, NOT mario s
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0 && w !== "the" && w !== "and")
    .join(" ");
}

/**
 * Normalise a UK postcode for dedup matching. Uppercase, all whitespace
 * removed. "AB15 8QA" → "AB158QA".
 */
export function normalisePostcode(
  postcode: string | null | undefined,
): string | null {
  if (!postcode) return null;
  const cleaned = postcode.toUpperCase().replace(/\s+/g, "");
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Derive a kebab-case slug from a business name. Mirrors the transform
 * documented in the /new-lead skill so a slug produced by NERVE and a slug
 * produced by a Claude session collide on the same canonical row.
 *
 *   "Bandit Bakery"         → "bandit-bakery"
 *   "Mario's Deli & Café"   → "marios-deli-and-cafe"
 *   "St. John Bakery"       → "st-john-bakery"
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ── Store ────────────────────────────────────────────────────────────────

export const businessIdentityStore = {
  /**
   * The Phase F primitive. Every producer (skill, ingest endpoint, manual
   * form) calls this before scaffolding a new lead. Idempotent on
   * (normalised_name, postcode).
   *
   * Lookup order:
   *   1. exact (normalised_name, postcode)
   *   2. when input has NO postcode: normalised_name with any postcode,
   *      collapses if exactly one match (else create)
   *   3. when input HAS postcode but no exact match: normalised_name with
   *      NULL postcode in DB, backfills the postcode if exactly one match
   *   4. create new row
   */
  async lookupOrCreate(input: LookupInput): Promise<BusinessIdentityRow> {
    const normalised = normaliseName(input.business_name);
    const postcode = normalisePostcode(input.postcode);

    // 1. Exact match on (normalised_name, postcode).
    let row = await prisma.businessIdentity.findFirst({
      where: { normalisedName: normalised, postcode },
    });

    // 2. Input has no postcode: collapse onto an existing row if there's
    //    exactly one same-name candidate (regardless of its postcode).
    if (!row && postcode === null) {
      const candidates = await prisma.businessIdentity.findMany({
        where: { normalisedName: normalised },
        take: 2,
      });
      if (candidates.length === 1) row = candidates[0];
    }

    // 3. Input has postcode but no exact match: opportunistically backfill
    //    onto an existing postcode-less row if there's exactly one.
    if (!row && postcode !== null) {
      const candidates = await prisma.businessIdentity.findMany({
        where: { normalisedName: normalised, postcode: null },
        take: 2,
      });
      if (candidates.length === 1) {
        row = await prisma.businessIdentity.update({
          where: { id: candidates[0].id },
          data: { postcode, lastSeenAt: new Date() },
        });
      }
    }

    if (row) {
      const update: Prisma.BusinessIdentityUpdateInput = {
        lastSeenAt: new Date(),
      };
      if (!row.vertical && input.vertical) update.vertical = input.vertical;
      row = await prisma.businessIdentity.update({
        where: { id: row.id },
        data: update,
      });
      return rowToOut(row);
    }

    // 4. Create. Honour preferred_slug if free; otherwise derive + uniquify.
    const baseSlug = input.preferred_slug?.length
      ? input.preferred_slug
      : slugify(input.business_name);
    const slug = await uniqueSlug(baseSlug);
    const created = await prisma.businessIdentity.create({
      data: {
        slug,
        businessName: input.business_name,
        normalisedName: normalised,
        postcode,
        vertical: input.vertical ?? null,
      },
    });
    return rowToOut(created);
  },

  async findBySlug(slug: string): Promise<BusinessIdentityRow | null> {
    const row = await prisma.businessIdentity.findUnique({ where: { slug } });
    return row ? rowToOut(row) : null;
  },

  async findById(id: string): Promise<BusinessIdentityRow | null> {
    const row = await prisma.businessIdentity.findUnique({ where: { id } });
    return row ? rowToOut(row) : null;
  },

  /** Polymorphic dispatch — accepts canonical id (cuid) OR canonical slug. */
  async findByAnyId(idOrSlug: string): Promise<BusinessIdentityRow | null> {
    return (
      (await this.findBySlug(idOrSlug)) ?? (await this.findById(idOrSlug))
    );
  },

  /** Lookup without creating. Used by skill consultation read endpoint. */
  async lookup(
    name: string,
    postcode?: string | null,
  ): Promise<BusinessIdentityRow | null> {
    const normalised = normaliseName(name);
    const pc = normalisePostcode(postcode);

    // Exact match path.
    const exact = await prisma.businessIdentity.findFirst({
      where: { normalisedName: normalised, postcode: pc },
    });
    if (exact) return rowToOut(exact);

    // Name-only fallback — returns a match only if unambiguous.
    const candidates = await prisma.businessIdentity.findMany({
      where: { normalisedName: normalised },
      take: 2,
    });
    if (candidates.length === 1) return rowToOut(candidates[0]);
    return null;
  },

  async listAll(limit = 500): Promise<BusinessIdentityRow[]> {
    const rows = await prisma.businessIdentity.findMany({
      orderBy: { lastSeenAt: "desc" },
      take: limit,
    });
    return rows.map(rowToOut);
  },
};

// ── Mappers ──────────────────────────────────────────────────────────────

type Db = Awaited<ReturnType<typeof prisma.businessIdentity.findUnique>>;

function rowToOut(row: NonNullable<Db>): BusinessIdentityRow {
  return {
    id: row.id,
    slug: row.slug,
    business_name: row.businessName,
    normalised_name: row.normalisedName,
    postcode: row.postcode ?? null,
    vertical: row.vertical ?? null,
    first_seen_at: row.firstSeenAt.toISOString(),
    last_seen_at: row.lastSeenAt.toISOString(),
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

async function uniqueSlug(base: string): Promise<string> {
  const cleaned = base && base.length > 0 ? base : "business";
  let slug = cleaned;
  let n = 0;
  while (await prisma.businessIdentity.findUnique({ where: { slug } })) {
    n += 1;
    slug = `${cleaned}-${n}`;
  }
  return slug;
}
