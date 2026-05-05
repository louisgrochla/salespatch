-- Add email capture + welcome-flag columns to lead_onboarding_responses.
-- Customer can drop their email in the onboarding form before paying;
-- we fire a soft welcome email then, regardless of whether they
-- continue to checkout. The flag prevents the API route from
-- re-firing the email on every auto-save tick.

ALTER TABLE lead_onboarding_responses
  ADD COLUMN IF NOT EXISTS contact_email   text,
  ADD COLUMN IF NOT EXISTS welcome_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_lead_onboarding_email
  ON lead_onboarding_responses(contact_email)
  WHERE contact_email IS NOT NULL;
