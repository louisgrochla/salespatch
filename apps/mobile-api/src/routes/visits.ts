import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { requireAuth, getUser } from '../auth.js';
import { queryAll, queryOne, run } from '../db.js';
import {
  buildVisitEventId,
  forwardVisitEventToNerve,
} from '../nerve-visit-forwarder.js';

const router = Router();
router.use(requireAuth);

// POST /visits/start — begin a visit session
router.post('/start', (req, res) => {
  const { user_id } = getUser(req);
  const { assignment_id, lat, lng } = req.body;
  if (!assignment_id) { res.status(400).json({ error: 'assignment_id required' }); return; }

  const id = uuid();
  const now = new Date().toISOString();

  run(
    'INSERT INTO visit_sessions (id, assignment_id, user_id, started_at, start_lat, start_lng, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id, assignment_id, user_id, now, lat ?? null, lng ?? null, now,
  );

  // R9 — fire-and-forget mirror to NERVE. Skipped if we can't resolve
  // a lead_id (NERVE requires one); never blocks the response.
  const assignment = queryOne<{ lead_id: string }>(
    'SELECT lead_id FROM lead_assignments WHERE id = ? AND user_id = ?',
    assignment_id, user_id,
  );
  if (assignment?.lead_id) {
    void forwardVisitEventToNerve({
      event_id: buildVisitEventId(assignment_id, 'arrived', now),
      assignment_id,
      lead_id: assignment.lead_id,
      user_id,
      type: 'arrived',
      latitude: typeof lat === 'number' ? lat : null,
      longitude: typeof lng === 'number' ? lng : null,
      metadata: { source: 'mobile-api', session_id: id },
      occurred_at: now,
    });
  }

  res.status(201).json({ session_id: id, started_at: now });
});

// POST /visits/end — end a visit session
router.post('/end', (req, res) => {
  const { user_id } = getUser(req);
  const { session_id, lat, lng } = req.body;
  if (!session_id) { res.status(400).json({ error: 'session_id required' }); return; }

  const session = queryOne<Record<string, unknown>>(
    'SELECT * FROM visit_sessions WHERE id = ? AND user_id = ?',
    session_id, user_id,
  );
  if (!session) { res.status(404).json({ error: 'Session not found' }); return; }

  const now = new Date().toISOString();
  const startTime = new Date(session.started_at as string).getTime();
  const duration = Math.round((Date.now() - startTime) / 1000);

  // Simple verification: check if end GPS is within ~100m of start GPS
  let verified = false;
  if (session.start_lat && session.start_lng && lat && lng) {
    const dist = haversineDistance(
      session.start_lat as number, session.start_lng as number,
      lat, lng,
    );
    verified = dist < 200; // Within 200m
  }

  run(
    'UPDATE visit_sessions SET ended_at = ?, duration_seconds = ?, end_lat = ?, end_lng = ?, verified = ? WHERE id = ?',
    now, duration, lat ?? null, lng ?? null, verified ? 1 : 0, session_id,
  );

  // R9 — fire-and-forget mirror to NERVE. duration_minutes is rounded
  // for the dissertation aggregate (sum-of-minutes per lead).
  const assignmentId = session.assignment_id as string;
  const assignment = queryOne<{ lead_id: string }>(
    'SELECT lead_id FROM lead_assignments WHERE id = ? AND user_id = ?',
    assignmentId, user_id,
  );
  if (assignment?.lead_id) {
    void forwardVisitEventToNerve({
      event_id: buildVisitEventId(assignmentId, 'departed', now),
      assignment_id: assignmentId,
      lead_id: assignment.lead_id,
      user_id,
      type: 'departed',
      duration_minutes: Math.max(0, Math.round(duration / 60)),
      latitude: typeof lat === 'number' ? lat : null,
      longitude: typeof lng === 'number' ? lng : null,
      metadata: { source: 'mobile-api', session_id, verified },
      occurred_at: now,
    });
  }

  res.json({ ok: true, duration_seconds: duration, verified });
});

// POST /visits/track — background GPS ping during visit
router.post('/track', (req, res) => {
  const { user_id } = getUser(req);
  const { session_id, lat, lng } = req.body;

  // Just log it — could store in a separate gps_tracks table in future
  run(
    'INSERT INTO sales_activity_log (id, user_id, assignment_id, action, location_lat, location_lng, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    uuid(), user_id, session_id, 'gps_ping', lat, lng, new Date().toISOString(),
  );

  res.json({ ok: true });
});

// GET /visits/:assignmentId — visit history for a lead
router.get('/:assignmentId', (req, res) => {
  const { user_id } = getUser(req);
  const visits = queryAll<Record<string, unknown>>(
    'SELECT * FROM visit_sessions WHERE assignment_id = ? AND user_id = ? ORDER BY started_at DESC',
    req.params.assignmentId, user_id,
  );
  res.json({ visits });
});

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default router;
