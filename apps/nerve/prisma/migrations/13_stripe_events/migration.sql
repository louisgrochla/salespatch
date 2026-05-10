-- Stripe events — Tier 2 payment timeline.
--
-- B2 of Phase B. Append-only mirror of every signature-verified Stripe
-- webhook event the sales-dashboard receives. Lets the warehouse answer
-- "which closed pitches have a confirmed Stripe payment" without
-- touching Stripe or Supabase.
--
-- Producer: `apps/sales-dashboard/src/app/api/payments/webhook/route.ts`
-- fans out right after `constructEvent` verifies the signature.
-- Fire-and-forget — Stripe retries + the dashboard's local
-- stripe_events table own the "did the payment actually settle"
-- decision; NERVE just gets the complete event log.
--
-- Idempotency: `stripe_event_id` is Stripe's `evt_...` ID, globally
-- unique. Retries when Stripe re-fires after a 500 collapse onto the
-- same row.
--
-- `body_json` holds the full event payload verbatim. Stripe events are
-- typically <50KB; JSONB comfortably holds them. Denormalised business
-- keys (assignment_id, session_id, etc.) are extracted by the producer
-- so analytics joins don't have to parse body_json.

CREATE TABLE "stripe_events" (
    "id"                  TEXT             NOT NULL,
    "stripe_event_id"     TEXT             NOT NULL, -- evt_... — globally unique
    "type"                TEXT             NOT NULL, -- e.g. "checkout.session.completed"
    "api_version"         TEXT,
    "livemode"            BOOLEAN          NOT NULL DEFAULT TRUE,
    "account_id"          TEXT, -- Connect account, when applicable
    "request_id"          TEXT, -- originating Stripe request id
    "idempotency_key"     TEXT, -- Stripe-side caller idempotency
    "assignment_id"       TEXT, -- denormalised from metadata or event object
    "salesperson_id"      TEXT,
    "customer_id"         TEXT, -- Stripe cus_...
    "session_id"          TEXT, -- Stripe cs_...
    "subscription_id"     TEXT, -- Stripe sub_...
    "payment_intent_id"   TEXT, -- Stripe pi_...
    "invoice_id"          TEXT, -- Stripe in_...
    "amount_total_pence"  INTEGER, -- applies to checkout sessions / invoices
    "currency"            TEXT, -- lowercase ISO 4217
    "payment_status"      TEXT, -- "paid" | "unpaid" | "no_payment_required"
    "body_json"           JSONB            NOT NULL,
    "occurred_at"         TIMESTAMP(3)     NOT NULL, -- from event.created
    "created_at"          TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stripe_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stripe_events_stripe_event_id_key"          ON "stripe_events" ("stripe_event_id");
CREATE INDEX        "stripe_events_type_occurred_idx"            ON "stripe_events" ("type",            "occurred_at" DESC);
CREATE INDEX        "stripe_events_assignment_occurred_idx"      ON "stripe_events" ("assignment_id",   "occurred_at" DESC);
CREATE INDEX        "stripe_events_customer_occurred_idx"        ON "stripe_events" ("customer_id",     "occurred_at" DESC);
CREATE INDEX        "stripe_events_session_idx"                  ON "stripe_events" ("session_id");
CREATE INDEX        "stripe_events_subscription_idx"             ON "stripe_events" ("subscription_id");
CREATE INDEX        "stripe_events_payment_intent_idx"           ON "stripe_events" ("payment_intent_id");
