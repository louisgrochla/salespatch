import crypto from 'crypto';
import type Stripe from 'stripe';

// Sales-dashboard → NERVE ingest helper.
//
// Fire-and-forget POSTs to /api/ingest/* on nerve.salespatch.co.uk.
// Failure must NEVER bubble — Supabase/SQLite write is the source of
// truth, NERVE is a downstream mirror. The handlers that call this MUST
// catch + log; we don't throw.
//
// HMAC pattern matches the Phase A ingest convention:
//   header: X-Ingest-Signature: sha256=<hex>
//   secret: OUTCOME_INGEST_SECRET
//   body:   the raw JSON, signed verbatim
//
// Distinct from the legacy pitch route's NERVE_PITCH_SECRET +
// x-supabase-signature path. Migrating that is out of scope for the
// Phase B work; new producers (B1 lead-assignment events, B2 Stripe
// events) all go through this helper on the unified secret.

const NERVE_BASE_URL =
  process.env.NERVE_BASE_URL ?? 'https://nerve.salespatch.co.uk';
const TIMEOUT_MS = 4_000;

export type AssignmentStatus = 'new' | 'visited' | 'pitched' | 'sold' | 'rejected';

export type LeadAssignmentEventSource =
  | 'status_patch'
  | 'pitch_cascade'
  | 'supabase_poll'
  | 'backfill'
  | 'test';

export interface LeadAssignmentEventPayload {
  event_id: string;
  assignment_id: string;
  lead_id: string;
  user_id?: string | null;
  prev_status?: AssignmentStatus | null;
  status: AssignmentStatus;
  source?: LeadAssignmentEventSource;
  rejection_reason?: string | null;
  commission_amount_pence?: number | null;
  notes?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  metadata?: Record<string, unknown>;
  occurred_at: string; // ISO 8601
}

export interface NerveIngestResult {
  ok: boolean;
  status?: number;
  error?: string;
  body?: unknown;
}

/**
 * Build a stable event_id from assignment_id, status, and occurred_at.
 * Same status flipped at the same instant → same event_id → idempotent.
 * Colons stripped from the timestamp because event_ids appear in URLs.
 */
export function buildEventId(
  assignmentId: string,
  status: AssignmentStatus,
  occurredAtIso: string,
): string {
  const stamp = occurredAtIso.replace(/[:.]/g, '').replace(/[-]/g, '');
  return `${assignmentId}:${status}:${stamp}`;
}

/**
 * Post a lead-assignment event to NERVE. Returns a result object;
 * never throws. Callers should pattern-match `ok` and log the rest.
 *
 * Secret resolution is lazy so a Vercel deploy missing the env var
 * fails noisily on first invocation rather than at module load.
 */
export async function postLeadAssignmentEvent(
  payload: LeadAssignmentEventPayload,
): Promise<NerveIngestResult> {
  return postSigned('/api/ingest/lead-assignment', payload);
}

// ─── Onboarding responses (B4) ─────────────────────────────────────────

export interface OnboardingPhotoEntry {
  url: string;
  filename: string;
  content_type?: string;
  uploaded_at: string;
}

export interface OnboardingResponsePayload {
  lead_assignment_id: string;
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

/**
 * Build an OnboardingResponsePayload from a Supabase
 * lead_onboarding_responses row. Used by the onboarding POST handler
 * after its upsert returns the cumulative latest state.
 *
 * Unlike B1/B2/B3 which build payloads from event arguments, this
 * helper takes the FULL row so the cumulative snapshot is what flows
 * to NERVE. The form auto-saves on every keystroke so NERVE sees the
 * running state, not deltas.
 */
export function buildOnboardingResponsePayload(
  leadAssignmentId: string,
  row: Record<string, unknown>,
): OnboardingResponsePayload {
  return {
    lead_assignment_id: leadAssignmentId,
    contact_phone: (row.contact_phone as string | null) ?? null,
    contact_email: (row.contact_email as string | null) ?? null,
    top_changes: (row.top_changes as string | null) ?? null,
    anything_else: (row.anything_else as string | null) ?? null,
    has_existing_domain: (row.has_existing_domain as boolean | null) ?? null,
    existing_domain: (row.existing_domain as string | null) ?? null,
    domain_preferences: (row.domain_preferences as string[] | null) ?? null,
    photos: (row.photos as OnboardingPhotoEntry[] | null) ?? null,
    completed_at: (row.completed_at as string | null) ?? null,
    welcome_sent_at: (row.welcome_sent_at as string | null) ?? null,
    raw_payload: row,
  };
}

/**
 * Post an onboarding response snapshot to NERVE. Fire-and-forget — never throws.
 */
export async function postOnboardingResponse(
  payload: OnboardingResponsePayload,
): Promise<NerveIngestResult> {
  return postSigned('/api/ingest/onboarding-response', payload);
}

// ─── Salesperson events (B3) ───────────────────────────────────────────

export type SalespersonEventType =
  | 'signup'
  | 'profile_update'
  | 'stripe_connect_created'
  | 'stripe_connect_completed'
  | 'pin_reset'
  | 'deactivated'
  | 'reactivated'
  // String union escape hatch — let producers record types we haven't
  // formalised yet without forcing a helper update.
  | (string & {});

export type SalespersonEventSource =
  | 'signup_handler'
  | 'admin_panel'
  | 'payments_connect'
  | 'auth_demo'
  | 'test'
  | (string & {});

export interface SalespersonEventPayload {
  event_id: string;
  user_id: string;
  type: SalespersonEventType;
  display_name?: string | null;
  area_postcode?: string | null;
  stripe_connect_id?: string | null;
  source?: SalespersonEventSource;
  notes?: string | null;
  metadata?: Record<string, unknown>;
  occurred_at: string;
}

/**
 * Build a stable salesperson event_id. Same user / type / instant ⇒
 * same id ⇒ NERVE deduplicates. Colons stripped from the timestamp
 * because event_ids appear in URLs.
 */
export function buildSalespersonEventId(
  userId: string,
  type: SalespersonEventType,
  occurredAtIso: string,
): string {
  const stamp = occurredAtIso.replace(/[:.]/g, '').replace(/[-]/g, '');
  return `${userId}:${type}:${stamp}`;
}

/**
 * Post a salesperson event to NERVE. Fire-and-forget — never throws.
 */
export async function postSalespersonEvent(
  payload: SalespersonEventPayload,
): Promise<NerveIngestResult> {
  return postSigned('/api/ingest/salesperson-event', payload);
}

// ─── Stripe events (B2) ────────────────────────────────────────────────

export interface StripeEventPayload {
  stripe_event_id: string;
  type: string;
  api_version?: string | null;
  livemode?: boolean;
  account_id?: string | null;
  request_id?: string | null;
  idempotency_key?: string | null;
  assignment_id?: string | null;
  salesperson_id?: string | null;
  customer_id?: string | null;
  session_id?: string | null;
  subscription_id?: string | null;
  payment_intent_id?: string | null;
  invoice_id?: string | null;
  amount_total_pence?: number | null;
  currency?: string | null;
  payment_status?: string | null;
  body_json: Record<string, unknown>;
  occurred_at: string;
}

/**
 * Build a NERVE-bound Stripe event payload from a verified Stripe.Event.
 * Extracts denormalised business keys (assignment_id, customer_id, etc.)
 * from the event object via duck-typing so the same extractor works
 * across checkout sessions, payment intents, subscriptions, invoices,
 * and charges without an event-type switch. Fields we can't find stay
 * null — NERVE accepts them as optional.
 */
export function buildStripeEventPayload(
  event: Stripe.Event,
): StripeEventPayload {
  // Stripe's Event.data.object is the underlying resource. Cast through
  // unknown because the union of all resource types is wide and we only
  // probe for fields we expect.
  const obj = event.data.object as unknown as Record<string, unknown>;

  const meta = (obj.metadata ?? {}) as Record<string, unknown>;
  const assignmentId = readString(meta, 'lead_assignment_id');
  const salespersonId = readString(meta, 'salesperson_id');

  return {
    stripe_event_id: event.id,
    type: event.type,
    api_version: event.api_version ?? null,
    livemode: event.livemode,
    account_id: event.account ?? null,
    request_id:
      typeof event.request === 'string'
        ? event.request
        : event.request?.id ?? null,
    idempotency_key:
      typeof event.request === 'object' && event.request
        ? event.request.idempotency_key ?? null
        : null,
    assignment_id: assignmentId ?? null,
    salesperson_id: salespersonId ?? null,
    customer_id: readStripeRef(obj.customer) ?? null,
    session_id: pickStripeId(obj, ['cs_']) ?? null,
    subscription_id:
      readStripeRef(obj.subscription) ??
      pickStripeId(obj, ['sub_']) ??
      null,
    payment_intent_id:
      readStripeRef(obj.payment_intent) ??
      pickStripeId(obj, ['pi_']) ??
      null,
    invoice_id:
      readStripeRef(obj.invoice) ?? pickStripeId(obj, ['in_']) ?? null,
    amount_total_pence:
      pickInt(obj, ['amount_total', 'amount_paid', 'amount']) ?? null,
    currency: readString(obj, 'currency') ?? null,
    payment_status: readString(obj, 'payment_status') ?? null,
    body_json: event as unknown as Record<string, unknown>,
    occurred_at: new Date(event.created * 1000).toISOString(),
  };
}

/**
 * Post a Stripe event to NERVE. Fire-and-forget — never throws. Callers
 * should pattern-match `ok` and log the rest.
 */
export async function postStripeEvent(
  payload: StripeEventPayload,
): Promise<NerveIngestResult> {
  return postSigned('/api/ingest/stripe-event', payload);
}

// ─── shared HMAC POST plumbing ─────────────────────────────────────────

async function postSigned(
  pathSuffix: string,
  payload: unknown,
): Promise<NerveIngestResult> {
  const secret = process.env.OUTCOME_INGEST_SECRET;
  if (!secret) {
    return {
      ok: false,
      error: 'OUTCOME_INGEST_SECRET not configured on sales-dashboard',
    };
  }

  const bodyJson = JSON.stringify(payload);
  const signature =
    'sha256=' +
    crypto.createHmac('sha256', secret).update(bodyJson).digest('hex');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${NERVE_BASE_URL}${pathSuffix}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Ingest-Signature': signature,
      },
      body: bodyJson,
      signal: controller.signal,
    });
    const respBody = await res.json().catch(() => undefined);
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error:
          (respBody as { error?: string })?.error ?? `HTTP ${res.status}`,
        body: respBody,
      };
    }
    return { ok: true, status: res.status, body: respBody };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(timer);
  }
}

function readString(
  obj: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = obj[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function readStripeRef(v: unknown): string | undefined {
  // Stripe expandable references are either the bare ID string or an
  // expanded object with an `.id` field. Handle both.
  if (typeof v === 'string' && v.length > 0) return v;
  if (v && typeof v === 'object' && 'id' in v) {
    const id = (v as { id?: unknown }).id;
    if (typeof id === 'string' && id.length > 0) return id;
  }
  return undefined;
}

/** Find an id-like value on the object whose prefix matches one of `prefixes`. */
function pickStripeId(
  obj: Record<string, unknown>,
  prefixes: string[],
): string | undefined {
  // Common slot: `id` itself (e.g. checkout.Session, PaymentIntent, etc.).
  const id = obj.id;
  if (typeof id === 'string' && prefixes.some((p) => id.startsWith(p))) {
    return id;
  }
  return undefined;
}

function pickInt(
  obj: Record<string, unknown>,
  keys: string[],
): number | undefined {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  }
  return undefined;
}
