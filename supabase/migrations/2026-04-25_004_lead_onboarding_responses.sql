-- ============================================================
-- 2026-04-25 004 — lead_onboarding_responses
-- ============================================================
-- Captures the customer's post-payment 5-question onboarding form.
-- Each field auto-saves on every keystroke (debounced 500ms client-side)
-- so a customer who bails mid-form leaves us what they typed.
--
-- One row per assignment (PRIMARY KEY = lead_assignment_id, on delete
-- cascades when the parent assignment is removed).
--
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS lead_onboarding_responses (
  lead_assignment_id   text PRIMARY KEY
                          REFERENCES lead_assignments(id) ON DELETE CASCADE,

  -- Q1: Confirm contact (mobile to text on)
  contact_phone        text,

  -- Q2: Top 3 changes for day 1
  top_changes          text,

  -- Q3: Photos — uploaded directly to Supabase Storage `customer-uploads`.
  -- Stored here as an array of { url, filename, content_type, uploaded_at }.
  photos               jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Q4: Domain — capture preference. Fulfilment handles DNS/purchase manually.
  has_existing_domain  boolean,
  existing_domain      text,
  domain_preferences   jsonb,                 -- array of strings, top 3

  -- Q5: Anything else (optional)
  anything_else        text,

  completed_at         timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at_lor
  BEFORE UPDATE ON lead_onboarding_responses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE lead_onboarding_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access"
  ON lead_onboarding_responses
  FOR ALL
  USING (true)
  WITH CHECK (true);
