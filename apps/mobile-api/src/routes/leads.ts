import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { requireAuth, getUser } from '../auth.js';
import { queryAll, queryOne, run } from '../db.js';
import { forwardPitchToNerve, type NervePitchPayload } from '../nerve-forwarder.js';
import {
  buildVisitEventId,
  forwardVisitEventToNerve,
} from '../nerve-visit-forwarder.js';

const router = Router();
router.use(requireAuth);

// GET /leads — compact list for mobile
router.get('/', (req, res) => {
  const { user_id } = getUser(req);
  const status = req.query.status as string | undefined;

  let sql = `SELECT la.id as assignment_id, la.lead_id, la.status, la.assigned_at,
    la.visited_at, la.pitched_at, la.notes,
    la.commission_amount, la.location_lat, la.location_lng
    FROM lead_assignments la WHERE la.user_id = ?`;
  const params: unknown[] = [user_id];

  if (status && status !== 'all') {
    sql += ' AND la.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY la.assigned_at DESC';

  const rows = queryAll<Record<string, unknown>>(sql, ...params);

  // Enrich with lead data from notes JSON
  const leads = rows.map(row => {
    let data: Record<string, unknown> = {};
    try { data = JSON.parse((row.notes as string) ?? '{}'); } catch { /* */ }
    return {
      id: row.assignment_id,
      lead_id: row.lead_id,
      status: row.status,
      business_name: data.business_name ?? 'Unknown',
      business_type: data.business_type ?? '',
      postcode: data.postcode ?? '',
      phone: data.phone ?? '',
      google_rating: data.google_rating ?? 0,
      google_review_count: data.google_review_count ?? 0,
      has_demo_site: !!data.demo_site_domain,
      opening_hours: data.opening_hours ?? [],
      services: data.services ?? [],
    };
  });

  res.json({ leads, count: leads.length });
});

// GET /leads/:id — full detail
router.get('/:id', (req, res) => {
  const { user_id } = getUser(req);
  const row = queryOne<Record<string, unknown>>(
    'SELECT * FROM lead_assignments WHERE id = ? AND user_id = ?',
    req.params.id, user_id,
  );
  if (!row) { res.status(404).json({ error: 'Lead not found' }); return; }

  let data: Record<string, unknown> = {};
  try { data = JSON.parse((row.notes as string) ?? '{}'); } catch { /* */ }

  res.json({
    id: row.id,
    lead_id: row.lead_id,
    status: row.status,
    assigned_at: row.assigned_at,
    visited_at: row.visited_at,
    pitched_at: row.pitched_at,
    sold_at: row.sold_at,
    follow_up_at: row.follow_up_at ?? data.follow_up_at,
    follow_up_note: row.follow_up_note ?? data.follow_up_note,
    contact_name: row.contact_name ?? data.contact_name,
    contact_role: row.contact_role ?? data.contact_role,
    business_name: data.business_name ?? 'Unknown',
    business_type: data.business_type ?? '',
    postcode: data.postcode ?? '',
    address: data.address ?? data.postcode ?? '',
    phone: data.phone ?? '',
    google_rating: data.google_rating ?? 0,
    google_review_count: data.google_review_count ?? 0,
    has_demo_site: !!data.demo_site_domain,
    demo_site_domain: data.demo_site_domain,
    opening_hours: data.opening_hours ?? [],
    services: data.services ?? [],
    trust_badges: data.trust_badges ?? [],
    avoid_topics: data.avoid_topics ?? [],
    best_reviews: data.best_reviews ?? [],
  });
});

// PATCH /leads/:id/status — update status with GPS
router.patch('/:id/status', (req, res) => {
  const { user_id } = getUser(req);
  const { status, lat, lng } = req.body;
  const validStatuses = ['new', 'visited', 'pitched', 'sold', 'rejected'];
  if (!validStatuses.includes(status)) {
    res.status(400).json({ error: 'Invalid status' });
    return;
  }

  const now = new Date().toISOString();
  const updates: string[] = [`status = '${status}'`, `updated_at = '${now}'`];
  if (lat && lng) {
    updates.push(`location_lat = ${lat}`, `location_lng = ${lng}`);
  }
  if (status === 'visited') updates.push(`visited_at = '${now}'`);
  if (status === 'pitched') updates.push(`pitched_at = '${now}'`);
  if (status === 'sold') updates.push(`sold_at = '${now}'`, `commission_amount = 50`);

  run(`UPDATE lead_assignments SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`, req.params.id, user_id);

  // Log activity
  run(
    'INSERT INTO sales_activity_log (id, user_id, assignment_id, action, location_lat, location_lng, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    uuid(), user_id, req.params.id, `status_${status}`, lat ?? null, lng ?? null, now,
  );

  // R9 — fire-and-forget `pitched` visit_event when the SP marks the
  // visit as pitched. Other status transitions don't map to a
  // visit_event type (arrived/departed come from /visits, sold belongs
  // to the pitch row + Stripe).
  if (status === 'pitched') {
    const assignment = queryOne<{ lead_id: string }>(
      'SELECT lead_id FROM lead_assignments WHERE id = ? AND user_id = ?',
      req.params.id, user_id,
    );
    if (assignment?.lead_id) {
      void forwardVisitEventToNerve({
        event_id: buildVisitEventId(req.params.id, 'pitched', now),
        assignment_id: req.params.id,
        lead_id: assignment.lead_id,
        user_id,
        type: 'pitched',
        latitude: typeof lat === 'number' ? lat : null,
        longitude: typeof lng === 'number' ? lng : null,
        metadata: { source: 'mobile-api', via: 'patch-status' },
        occurred_at: now,
      });
    }
  }

  res.json({ ok: true, status });
});

// POST /leads/:id/intel — save follow-up intel
router.post('/:id/intel', (req, res) => {
  const { user_id } = getUser(req);
  const { interest_level, sentiment, objection, competitor, price_discussed, best_time, contact_name, contact_role, notes } = req.body;
  const now = new Date().toISOString();

  // Store as activity log entries
  const intelData = JSON.stringify({ interest_level, sentiment, objection, competitor, price_discussed, best_time, contact_name, contact_role, notes });
  run(
    'INSERT INTO sales_activity_log (id, user_id, assignment_id, action, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    uuid(), user_id, req.params.id, 'intel_captured', intelData, now,
  );

  // Update contact info on assignment if provided
  if (contact_name || contact_role) {
    const row = queryOne<Record<string, unknown>>('SELECT notes FROM lead_assignments WHERE id = ? AND user_id = ?', req.params.id, user_id);
    if (row) {
      let data: Record<string, unknown> = {};
      try { data = JSON.parse((row.notes as string) ?? '{}'); } catch { /* */ }
      if (contact_name) data.contact_name = contact_name;
      if (contact_role) data.contact_role = contact_role;
      run('UPDATE lead_assignments SET notes = ?, updated_at = ? WHERE id = ? AND user_id = ?', JSON.stringify(data), now, req.params.id, user_id);
    }
  }

  // R9 — fire-and-forget `feedback` visit_event when the intel has any
  // semantic content. The free-form `notes` field is the most useful
  // signal for RAG (the NERVE side embeds `feedback` text into the
  // vault); structured fields ride along in `metadata` for the ops
  // surface. interest_level maps to the SP rating (cold=1, warm=3,
  // hot=5) since both express the SP's read of the lead.
  const feedbackText = buildIntelFeedbackText({ notes, objection, competitor, sentiment, best_time, price_discussed });
  if (feedbackText) {
    const assignment = queryOne<{ lead_id: string }>(
      'SELECT lead_id FROM lead_assignments WHERE id = ? AND user_id = ?',
      req.params.id, user_id,
    );
    if (assignment?.lead_id) {
      void forwardVisitEventToNerve({
        event_id: buildVisitEventId(req.params.id, 'feedback', now),
        assignment_id: req.params.id,
        lead_id: assignment.lead_id,
        user_id,
        type: 'feedback',
        feedback: feedbackText,
        rating: interestLevelToRating(interest_level),
        metadata: {
          source: 'mobile-api',
          via: 'intel',
          interest_level: interest_level ?? null,
          sentiment: sentiment ?? null,
          objection: objection ?? null,
          competitor: competitor ?? null,
          best_time: best_time ?? null,
          price_discussed: price_discussed ?? null,
        },
        occurred_at: now,
      });
    }
  }

  res.json({ ok: true });
});

function buildIntelFeedbackText(input: {
  notes?: unknown; objection?: unknown; competitor?: unknown;
  sentiment?: unknown; best_time?: unknown; price_discussed?: unknown;
}): string | null {
  const parts: string[] = [];
  const note = typeof input.notes === 'string' ? input.notes.trim() : '';
  if (note) parts.push(note);
  const obj = typeof input.objection === 'string' ? input.objection.trim() : '';
  if (obj) parts.push(`Objection: ${obj}`);
  const comp = typeof input.competitor === 'string' ? input.competitor.trim() : '';
  if (comp) parts.push(`Competitor mentioned: ${comp}`);
  const sent = typeof input.sentiment === 'string' ? input.sentiment.trim() : '';
  if (sent) parts.push(`Sentiment: ${sent}`);
  const best = typeof input.best_time === 'string' ? input.best_time.trim() : '';
  if (best) parts.push(`Best follow-up time: ${best}`);
  const price = typeof input.price_discussed === 'string' ? input.price_discussed.trim() : '';
  if (price) parts.push(`Price discussed: ${price}`);
  const out = parts.join('\n');
  return out.length > 0 ? out : null;
}

function interestLevelToRating(level: unknown): number | null {
  if (level === 'cold') return 1;
  if (level === 'warm') return 3;
  if (level === 'hot') return 5;
  return null;
}

function buildPitchFeedbackText(input: {
  notes: string | null; firstResponsePhrase: string | null;
  competitorMentioned: string | null; objections: string[];
  demoReaction: string | null;
}): string | null {
  const parts: string[] = [];
  if (input.notes) parts.push(input.notes);
  if (input.firstResponsePhrase) parts.push(`First response: "${input.firstResponsePhrase}"`);
  if (input.competitorMentioned) parts.push(`Competitor mentioned: ${input.competitorMentioned}`);
  if (input.objections.length > 0) parts.push(`Objections: ${input.objections.join(', ')}`);
  if (input.demoReaction) parts.push(`Demo reaction: ${input.demoReaction}`);
  const out = parts.join('\n');
  return out.length > 0 ? out : null;
}

function gutFeelToRating(pct: number | null): number | null {
  if (pct == null) return null;
  if (pct < 0 || pct > 100) return null;
  if (pct === 0) return 1;
  return Math.min(5, Math.ceil(pct / 20));
}

// POST /leads/:id/pitch — record the post-pitch questionnaire
//
// Stores the structured pitch row locally (always succeeds) and
// asynchronously forwards to NERVE /api/ingest/pitch. Forward failures
// are logged on the row so they can be retried without losing data.
const ALLOWED_OUTCOMES = new Set([
  'closed_now', 'closed_followup', 'follow_up', 'rejected', 'not_pitched',
]);
const ALLOWED_INTEREST = new Set(['cold', 'warm', 'hot']);
const ALLOWED_DEMO_REACTION = new Set(['loved', 'liked', 'neutral', 'unimpressed']);
const ALLOWED_PAYMENT = new Set(['paid_now', 'will_pay_followup']);
const ALLOWED_FOLLOWUP_TIME = new Set(['tomorrow', 'this_week', 'next_week', 'next_month']);
const ALLOWED_NEXT_STEP = new Set(['sp_will_call', 'customer_will_call', 'sent_link', 'scheduled_meeting']);

function asBoolInt(v: unknown): number | null {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === 1 || v === 0) return v;
  return null;
}
function asStringIn(v: unknown, allowed: Set<string>): string | null {
  if (typeof v === 'string' && allowed.has(v)) return v;
  return null;
}
function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
}
function asInt(v: unknown): number | null {
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  return null;
}
function asString(v: unknown): string | null {
  if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  return null;
}

router.post('/:id/pitch', async (req, res) => {
  const { user_id } = getUser(req);
  const assignmentId = req.params.id;

  // Validate outcome (the only field that matters for routing rules).
  const outcome = typeof req.body.outcome === 'string' ? req.body.outcome : '';
  if (!ALLOWED_OUTCOMES.has(outcome)) {
    res.status(400).json({ error: `invalid outcome: ${outcome}` });
    return;
  }

  // Look up the assignment to denormalise lead context for NERVE.
  const assignment = queryOne<Record<string, unknown>>(
    'SELECT * FROM lead_assignments WHERE id = ? AND user_id = ?',
    assignmentId, user_id,
  );
  if (!assignment) {
    res.status(404).json({ error: 'assignment not found' });
    return;
  }
  let leadNotes: Record<string, unknown> = {};
  try { leadNotes = JSON.parse((assignment.notes as string) ?? '{}'); } catch { /* */ }

  // Compute the attempt number from pitched_at history.
  const prior = queryOne<Record<string, number>>(
    'SELECT COUNT(*) as n FROM pitches WHERE lead_id = ?',
    assignment.lead_id as string,
  );
  const pitchAttemptNumber = (prior?.n ?? 0) + 1;

  const id = uuid();
  const pitchedAt = typeof req.body.pitched_at === 'string' ? req.body.pitched_at : new Date().toISOString();
  const now = new Date().toISOString();

  // Pull out + validate every field. Anything with an enum gets
  // checked; primitives are coerced to safe SQLite types.
  const pitchDuration = asInt(req.body.pitch_duration_seconds) ?? asInt(req.body.pitch_duration);
  const decisionMakerPresent = asBoolInt(req.body.decision_maker_present);
  const demoShown = asBoolInt(req.body.demo_shown);
  const interestLevel = asStringIn(req.body.interest_level, ALLOWED_INTEREST);
  const consentToRecord = asBoolInt(req.body.consent_to_record) ?? 0;
  const demoReaction = asStringIn(req.body.demo_reaction, ALLOWED_DEMO_REACTION);
  const agreedPrice = asNumber(req.body.agreed_price);
  const paymentMethod = asStringIn(req.body.payment_method, ALLOWED_PAYMENT);
  const bestFollowupTime = asStringIn(req.body.best_followup_time, ALLOWED_FOLLOWUP_TIME);
  const agreedNextStep = asStringIn(req.body.agreed_next_step, ALLOWED_NEXT_STEP);
  const gutFeelClosePct = (() => {
    const v = asInt(req.body.gut_feel_close_pct);
    return v != null && v >= 0 && v <= 100 ? v : null;
  })();
  const firstResponsePhrase = asString(req.body.first_response_phrase);
  const competitorMentioned = asString(req.body.competitor_mentioned);
  const notes = asString(req.body.notes);
  const gpsLat = asNumber(req.body.gps_lat);
  const gpsLng = asNumber(req.body.gps_lng);
  const objections: string[] = Array.isArray(req.body.objections)
    ? (req.body.objections as unknown[])
        .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    : [];
  const demoVersion = asString(req.body.demo_version);

  // Persist locally — always succeeds, even if NERVE is unreachable.
  run(
    `INSERT INTO pitches (
      id, lead_id, assignment_id, user_id,
      outcome, pitch_duration_seconds, pitch_attempt_number, demo_version,
      decision_maker_present, demo_shown, interest_level, consent_to_record,
      demo_reaction, agreed_price, payment_method, best_followup_time, agreed_next_step,
      objections_json,
      gut_feel_close_pct, first_response_phrase, competitor_mentioned, notes,
      gps_lat, gps_lng,
      business_name, business_type, sector, location,
      pitched_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, assignment.lead_id, assignmentId, user_id,
    outcome, pitchDuration, pitchAttemptNumber, demoVersion,
    decisionMakerPresent, demoShown, interestLevel, consentToRecord,
    demoReaction, agreedPrice, paymentMethod, bestFollowupTime, agreedNextStep,
    JSON.stringify(objections),
    gutFeelClosePct, firstResponsePhrase, competitorMentioned, notes,
    gpsLat, gpsLng,
    (leadNotes.business_name as string) ?? null,
    (leadNotes.business_type as string) ?? null,
    (leadNotes.sector as string) ?? null,
    (leadNotes.postcode as string) ?? null,
    pitchedAt, now,
  );

  // Update assignment status as a side effect — keeps the existing
  // status flow working without the iOS app needing two calls.
  const newStatus =
    outcome === 'closed_now' || outcome === 'closed_followup' ? 'sold' :
    outcome === 'rejected' ? 'rejected' :
    outcome === 'not_pitched' ? 'visited' :
    'pitched';
  run(
    `UPDATE lead_assignments
       SET status = ?, pitched_at = COALESCE(pitched_at, ?), updated_at = ?
       WHERE id = ? AND user_id = ?`,
    newStatus, pitchedAt, now, assignmentId, user_id,
  );

  // Activity log entry for audit trail.
  run(
    'INSERT INTO sales_activity_log (id, user_id, assignment_id, action, notes, location_lat, location_lng, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    uuid(), user_id, assignmentId, `pitch_${outcome}`, JSON.stringify({ pitch_id: id, outcome }), gpsLat, gpsLng, now,
  );

  // R9 — mirror the visit-side timeline. The structured pitch row goes
  // to /api/ingest/pitch above; here we emit lightweight visit_events
  // so /leads ops view + RAG vault see the pitch happened.
  //
  // `pitched` fires for any outcome except `not_pitched` (which is "I
  // visited but couldn't pitch" — that's a visit, not a pitch).
  // `feedback` fires when the SP wrote anything free-form on the
  // questionnaire.
  const leadId = assignment.lead_id as string;
  if (outcome !== 'not_pitched') {
    void forwardVisitEventToNerve({
      event_id: buildVisitEventId(assignmentId, 'pitched', pitchedAt),
      assignment_id: assignmentId,
      lead_id: leadId,
      user_id,
      type: 'pitched',
      duration_minutes: pitchDuration != null
        ? Math.max(0, Math.round(pitchDuration / 60))
        : null,
      latitude: gpsLat,
      longitude: gpsLng,
      metadata: {
        source: 'mobile-api',
        via: 'pitch',
        pitch_id: id,
        outcome,
        pitch_attempt_number: pitchAttemptNumber,
      },
      occurred_at: pitchedAt,
    });
  }

  const pitchFeedbackText = buildPitchFeedbackText({
    notes, firstResponsePhrase, competitorMentioned, objections, demoReaction,
  });
  if (pitchFeedbackText) {
    void forwardVisitEventToNerve({
      event_id: buildVisitEventId(assignmentId, 'feedback', pitchedAt),
      assignment_id: assignmentId,
      lead_id: leadId,
      user_id,
      type: 'feedback',
      feedback: pitchFeedbackText,
      rating: gutFeelToRating(gutFeelClosePct),
      latitude: gpsLat,
      longitude: gpsLng,
      metadata: {
        source: 'mobile-api',
        via: 'pitch',
        pitch_id: id,
        outcome,
        interest_level: interestLevel,
        demo_reaction: demoReaction,
      },
      occurred_at: pitchedAt,
    });
  }

  // Forward to NERVE. Failures don't fail the request — they're logged
  // on the pitch row for retry.
  const payload: NervePitchPayload = {
    id,
    business_name: (leadNotes.business_name as string) ?? 'Unknown business',
    business_type: (leadNotes.business_type as string) ?? null,
    sector: (leadNotes.sector as string) ?? null,
    location: (leadNotes.postcode as string) ?? null,
    lead_source: (leadNotes.source_method as string) ?? null,
    demo_version: demoVersion,
    outcome,
    contractor_id: user_id,
    pitch_duration: pitchDuration,
    pitch_attempt_number: pitchAttemptNumber,
    consent_to_record: consentToRecord === 1,
    decision_maker_present: decisionMakerPresent == null ? null : decisionMakerPresent === 1,
    demo_shown: demoShown == null ? null : demoShown === 1,
    interest_level: interestLevel,
    demo_reaction: demoReaction,
    agreed_price: agreedPrice,
    payment_method: paymentMethod,
    best_followup_time: bestFollowupTime,
    agreed_next_step: agreedNextStep,
    gut_feel_close_pct: gutFeelClosePct,
    first_response_phrase: firstResponsePhrase,
    competitor_mentioned: competitorMentioned,
    gps_lat: gpsLat,
    gps_lng: gpsLng,
    notes,
    objections,
    date: pitchedAt,
  };

  const result = await forwardPitchToNerve(payload);
  if (result.ok) {
    run(
      'UPDATE pitches SET forwarded_to_nerve_at = ?, forward_error = NULL WHERE id = ?',
      new Date().toISOString(), id,
    );
    res.json({
      ok: true,
      pitch_id: id,
      pitch_attempt_number: pitchAttemptNumber,
      forwarded: true,
      nerve_pitch_id: result.nervePitchId,
      quality_flag: result.qualityFlag,
    });
  } else {
    run(
      'UPDATE pitches SET forward_error = ? WHERE id = ?',
      result.error, id,
    );
    // 200 with forwarded=false — local save succeeded; surfaces the
    // forward failure transparently for retry tooling.
    res.json({
      ok: true,
      pitch_id: id,
      pitch_attempt_number: pitchAttemptNumber,
      forwarded: false,
      forward_error: result.error,
    });
  }
});

// GET /leads/:id/brief — quick brief data for walkthrough
router.get('/:id/brief', (req, res) => {
  const { user_id } = getUser(req);
  const row = queryOne<Record<string, unknown>>(
    'SELECT * FROM lead_assignments WHERE id = ? AND user_id = ?',
    req.params.id, user_id,
  );
  if (!row) { res.status(404).json({ error: 'Lead not found' }); return; }

  let data: Record<string, unknown> = {};
  try { data = JSON.parse((row.notes as string) ?? '{}'); } catch { /* */ }

  res.json({
    business_name: data.business_name,
    business_type: data.business_type,
    postcode: data.postcode,
    phone: data.phone,
    google_rating: data.google_rating,
    google_review_count: data.google_review_count,
    has_demo_site: !!data.demo_site_domain,
    services: data.services ?? [],
    opening_hours: data.opening_hours ?? [],
    trust_badges: data.trust_badges ?? [],
    avoid_topics: data.avoid_topics ?? [],
    best_reviews: data.best_reviews ?? [],
  });
});

// GET /stats — dashboard stats
router.get('/stats/summary', (req, res) => {
  const { user_id } = getUser(req);
  const counts = queryOne<Record<string, number>>(
    `SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) as queue,
      SUM(CASE WHEN status = 'visited' THEN 1 ELSE 0 END) as visited,
      SUM(CASE WHEN status = 'pitched' THEN 1 ELSE 0 END) as pitched,
      SUM(CASE WHEN status = 'sold' THEN 1 ELSE 0 END) as sold,
      SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
    FROM lead_assignments WHERE user_id = ?`,
    user_id,
  );

  res.json({
    total: counts?.total ?? 0,
    queue: counts?.queue ?? 0,
    visited: counts?.visited ?? 0,
    pitched: counts?.pitched ?? 0,
    sold: counts?.sold ?? 0,
    rejected: counts?.rejected ?? 0,
    earned: (counts?.sold ?? 0) * 50,
  });
});

export default router;
