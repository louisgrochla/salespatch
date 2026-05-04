-- Add follow-up + contact columns to lead_assignments. They were
-- already declared on the SQLite-side schema (safeAlter calls in
-- sales-dashboard's db/index.ts) but never made it into Supabase, so
-- the PATCH /api/leads/:id/followup route was 500ing in production.

ALTER TABLE lead_assignments
  ADD COLUMN IF NOT EXISTS follow_up_at   timestamptz,
  ADD COLUMN IF NOT EXISTS follow_up_note text,
  ADD COLUMN IF NOT EXISTS contact_name   text,
  ADD COLUMN IF NOT EXISTS contact_role   text;

-- Index for "who has follow-ups due in the next 7 days" type queries.
CREATE INDEX IF NOT EXISTS idx_lead_assignments_followup_at
  ON lead_assignments(follow_up_at)
  WHERE follow_up_at IS NOT NULL;
