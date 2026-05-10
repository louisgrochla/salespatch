import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

// ── Wire-format types ────────────────────────────────────────────────────

export interface OnboardingPhotoEntry {
  url: string;
  filename: string;
  content_type?: string;
  uploaded_at: string;
}

export interface OnboardingResponseInput {
  lead_assignment_id: string; // natural unique key
  contact_phone?: string | null;
  contact_email?: string | null;
  top_changes?: string | null;
  anything_else?: string | null;
  has_existing_domain?: boolean | null;
  existing_domain?: string | null;
  domain_preferences?: string[] | null;
  photos?: OnboardingPhotoEntry[] | null;
  completed_at?: string | null;
  welcome_sent_at?: string | null;
  raw_payload?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

export interface OnboardingResponseRow {
  id: string;
  lead_assignment_id: string;
  contact_phone?: string;
  contact_email?: string;
  top_changes?: string;
  anything_else?: string;
  has_existing_domain?: boolean;
  existing_domain?: string;
  domain_preferences?: string[];
  photos: OnboardingPhotoEntry[];
  completed_at?: string;
  welcome_sent_at?: string;
  save_count: number;
  first_saved_at: string;
  last_saved_at: string;
  raw_payload?: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface OnboardingResponseIngestResult {
  lead_assignment_id: string;
  inserted: boolean; // true on first save, false on subsequent updates
  save_count: number;
  completed: boolean;
  row: OnboardingResponseRow;
}

/**
 * NERVE-side store for `onboarding_responses`. Unlike the event-stream
 * tables (lead_assignment_events, stripe_events, salesperson_events),
 * this is an idempotent upsert keyed on `lead_assignment_id` — the
 * customer's form auto-saves on every keystroke, so each ingest
 * replaces the prior state with the cumulative latest. `save_count`
 * increments per ingest so drop-off ("they saved 12 times then bailed")
 * is one indexed query.
 *
 * Pattern: lead_profiles (A4), not lead_assignment_events (B1).
 */
export const onboardingResponseStore = {
  async ingest(
    input: OnboardingResponseInput,
  ): Promise<OnboardingResponseIngestResult> {
    const existing = await prisma.onboardingResponse.findUnique({
      where: { leadAssignmentId: input.lead_assignment_id },
    });

    const now = new Date();
    const completedAt = input.completed_at ? new Date(input.completed_at) : null;
    const welcomeSentAt = input.welcome_sent_at
      ? new Date(input.welcome_sent_at)
      : null;

    if (existing) {
      const row = await prisma.onboardingResponse.update({
        where: { leadAssignmentId: input.lead_assignment_id },
        data: {
          contactPhone: pickNullable(input.contact_phone, existing.contactPhone),
          contactEmail: pickNullable(input.contact_email, existing.contactEmail),
          topChanges: pickNullable(input.top_changes, existing.topChanges),
          anythingElse: pickNullable(input.anything_else, existing.anythingElse),
          hasExistingDomain: pickNullable(
            input.has_existing_domain,
            existing.hasExistingDomain,
          ),
          existingDomain: pickNullable(
            input.existing_domain,
            existing.existingDomain,
          ),
          domainPreferences: jsonPickNullable(
            input.domain_preferences,
            existing.domainPreferences,
          ),
          photos: jsonPickNullable(input.photos, existing.photos),
          // Sticky completion — once set, don't unset it.
          completedAt: completedAt ?? existing.completedAt,
          welcomeSentAt: welcomeSentAt ?? existing.welcomeSentAt,
          rawPayload: jsonPickNullable(input.raw_payload, existing.rawPayload),
          metadata:
            input.metadata !== undefined
              ? (input.metadata as Prisma.InputJsonValue)
              : (existing.metadata as Prisma.InputJsonValue),
          saveCount: { increment: 1 },
          lastSavedAt: now,
        },
      });
      return resultFromRow(row, false);
    }

    const row = await prisma.onboardingResponse.create({
      data: {
        leadAssignmentId: input.lead_assignment_id,
        contactPhone: input.contact_phone ?? null,
        contactEmail: input.contact_email ?? null,
        topChanges: input.top_changes ?? null,
        anythingElse: input.anything_else ?? null,
        hasExistingDomain: input.has_existing_domain ?? null,
        existingDomain: input.existing_domain ?? null,
        domainPreferences:
          input.domain_preferences === undefined
            ? Prisma.JsonNull
            : (input.domain_preferences as unknown as Prisma.InputJsonValue),
        photos:
          input.photos === undefined
            ? ([] as unknown as Prisma.InputJsonValue)
            : (input.photos as unknown as Prisma.InputJsonValue),
        completedAt,
        welcomeSentAt,
        saveCount: 1,
        firstSavedAt: now,
        lastSavedAt: now,
        rawPayload:
          input.raw_payload === undefined
            ? Prisma.JsonNull
            : (input.raw_payload as Prisma.InputJsonValue),
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
    return resultFromRow(row, true);
  },

  async getByLeadAssignmentId(
    leadAssignmentId: string,
  ): Promise<OnboardingResponseRow | null> {
    const row = await prisma.onboardingResponse.findUnique({
      where: { leadAssignmentId },
    });
    return row ? rowToResponse(row) : null;
  },

  async listCompleted(limit = 50): Promise<OnboardingResponseRow[]> {
    const rows = await prisma.onboardingResponse.findMany({
      where: { completedAt: { not: null } },
      orderBy: { completedAt: "desc" },
      take: limit,
    });
    return rows.map(rowToResponse);
  },

  async listIncomplete(limit = 50): Promise<OnboardingResponseRow[]> {
    const rows = await prisma.onboardingResponse.findMany({
      where: { completedAt: null },
      orderBy: { lastSavedAt: "desc" },
      take: limit,
    });
    return rows.map(rowToResponse);
  },
};

// ── Mappers ──────────────────────────────────────────────────────────────

type OnboardingResponseDb = Awaited<
  ReturnType<typeof prisma.onboardingResponse.findUnique>
>;

function resultFromRow(
  row: NonNullable<OnboardingResponseDb>,
  inserted: boolean,
): OnboardingResponseIngestResult {
  return {
    lead_assignment_id: row.leadAssignmentId,
    inserted,
    save_count: row.saveCount,
    completed: row.completedAt !== null,
    row: rowToResponse(row),
  };
}

function rowToResponse(
  row: NonNullable<OnboardingResponseDb>,
): OnboardingResponseRow {
  return {
    id: row.id,
    lead_assignment_id: row.leadAssignmentId,
    contact_phone: row.contactPhone ?? undefined,
    contact_email: row.contactEmail ?? undefined,
    top_changes: row.topChanges ?? undefined,
    anything_else: row.anythingElse ?? undefined,
    has_existing_domain: row.hasExistingDomain ?? undefined,
    existing_domain: row.existingDomain ?? undefined,
    domain_preferences:
      (row.domainPreferences as string[] | null) ?? undefined,
    photos: (row.photos as OnboardingPhotoEntry[] | null) ?? [],
    completed_at: row.completedAt?.toISOString(),
    welcome_sent_at: row.welcomeSentAt?.toISOString(),
    save_count: row.saveCount,
    first_saved_at: row.firstSavedAt.toISOString(),
    last_saved_at: row.lastSavedAt.toISOString(),
    raw_payload: (row.rawPayload as Record<string, unknown> | null) ?? undefined,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

// `undefined` = caller didn't supply the field → keep the existing value.
// `null` = caller explicitly cleared it → null. Anything else → set.
function pickNullable<T>(
  next: T | null | undefined,
  current: T | null,
): T | null {
  if (next === undefined) return current;
  return next;
}

function jsonPickNullable<T>(
  next: T | null | undefined,
  current: Prisma.JsonValue,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (next === undefined)
    return (current ?? Prisma.JsonNull) as Prisma.InputJsonValue;
  if (next === null) return Prisma.JsonNull;
  return next as unknown as Prisma.InputJsonValue;
}
