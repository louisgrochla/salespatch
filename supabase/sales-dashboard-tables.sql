-- ============================================================
-- Sales Dashboard Tables — operational tables for salesperson app
-- Run AFTER schema.sql in Supabase SQL Editor
-- ============================================================

-- ── sales_users ──────────────────────────────────────────────
CREATE TABLE sales_users (
  id              text PRIMARY KEY,
  name            text NOT NULL UNIQUE,
  pin_hash        text NOT NULL,
  email           text,
  phone           text,
  area_postcode   text,
  area_postcodes_json text,              -- JSON array of postcodes
  max_active_leads integer DEFAULT 20,
  user_status     text DEFAULT 'available',
  commission_rate real DEFAULT 0.10,
  active          boolean DEFAULT true,
  api_token       text,
  push_token      text,
  device_type     text CHECK (device_type IN ('web', 'ios', 'android')),
  last_active_at  timestamptz,
  stripe_connect_id text,                  -- Stripe Connect account for payouts
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ── lead_assignments ─────────────────────────────────────────
CREATE TABLE lead_assignments (
  id              text PRIMARY KEY,
  lead_id         text NOT NULL,
  user_id         text NOT NULL REFERENCES sales_users(id) ON DELETE CASCADE,
  assigned_at     timestamptz DEFAULT now(),
  status          text DEFAULT 'new' CHECK (status IN ('new', 'visited', 'pitched', 'sold', 'rejected')),
  visited_at      timestamptz,
  pitched_at      timestamptz,
  sold_at         timestamptz,
  rejected_at     timestamptz,
  rejection_reason text,
  notes           text,                  -- JSON blob with business data
  commission_amount real,
  location_lat    real,
  location_lng    real,
  follow_up_at    timestamptz,
  follow_up_note  text,
  contact_name    text,
  contact_role    text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_la_user_status ON lead_assignments(user_id, status);
CREATE INDEX idx_la_lead ON lead_assignments(lead_id);

-- ── sales_activity_log ───────────────────────────────────────
CREATE TABLE sales_activity_log (
  id              text PRIMARY KEY,
  user_id         text NOT NULL REFERENCES sales_users(id) ON DELETE CASCADE,
  lead_id         text,
  assignment_id   text REFERENCES lead_assignments(id) ON DELETE SET NULL,
  action          text NOT NULL,
  notes           text,
  location_lat    real,
  location_lng    real,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sal_user ON sales_activity_log(user_id, created_at DESC);
CREATE INDEX idx_sal_lead ON sales_activity_log(lead_id, created_at DESC);

-- ── demo_links ───────────────────────────────────────────────
CREATE TABLE demo_links (
  id              text PRIMARY KEY,
  code            text NOT NULL UNIQUE,
  assignment_id   text NOT NULL REFERENCES lead_assignments(id) ON DELETE CASCADE,
  user_id         text NOT NULL REFERENCES sales_users(id) ON DELETE CASCADE,
  lead_id         text NOT NULL,
  business_name   text NOT NULL,
  demo_domain     text,
  status          text DEFAULT 'active' CHECK (status IN ('active', 'viewed', 'interested', 'converted', 'expired')),
  views           integer DEFAULT 0,
  last_viewed_at  timestamptz,
  customer_name   text,
  customer_phone  text,
  customer_email  text,
  customer_message text,
  interested_at   timestamptz,
  converted_at    timestamptz,
  expires_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_dl_code ON demo_links(code);
CREATE INDEX idx_dl_assignment ON demo_links(assignment_id);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE sales_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON sales_users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON lead_assignments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON sales_activity_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON demo_links FOR ALL USING (true) WITH CHECK (true);

-- ── updated_at triggers ──────────────────────────────────────
CREATE TRIGGER set_updated_at BEFORE UPDATE ON sales_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON lead_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
