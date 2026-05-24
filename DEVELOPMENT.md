# OpenClaw Local Agent (Single Node) MVP Repo

This repository is the *spec and governance* foundation for building a local, voice-capable, multi-agent system integrated with **OpenClaw**.

It is designed to:
- Keep multiple builder models aligned to the same plan
- Prevent architectural drift and scope creep
- Enforce approval gating for any side effects
- Maintain a strong paper trail (Markdown + JSON changelogs)

## What’s inside
- `SPEC.md` single source of truth for the MVP
- `CONSTRAINTS.md` hard limits that builders must not exceed
- `GOVERNANCE/*` rules for prompting, change control, and changelog enforcement
- `OPENCLAW/*` interface contract and security expectations
- `AGENTS/*` agent contracts and capability boundaries
- `RELIABILITY/*` failure behaviors
- `PERFORMANCE/*` latency budget for real-time feel
- `OPERATIONS/*` observability and deployment guidance
- `ADR/*` architecture decision records (required for major changes)
- `CHANGELOG/*` immutable build history

## Using with Claude Code
Claude Code reads `CLAUDE.md` automatically at the start of every session.
All project rules, key commands, and deployment context are defined there.

## Runtime modes
- Exact Next.js Mission Control app (imported from your prior project): from repo root run `npm run mc:install` then `npm run mc:dev` and open `http://127.0.0.1:3000`.
  - Source path: `apps/mission-control`.
  - This is the original full UI/API stack, separate from the TypeScript mission-control runtime on `4317`.
  - Includes in-app OpenClaw native cron manager at `Settings` (create/list/run/disable/remove cron jobs without terminal).
  - Safer local-only mode (recommended for development): `npm run mc:dev:safe` (binds `127.0.0.1` only).
  - Task APIs in imported app now support natural-language assignment inference when `assigned_agent_id` is not provided:
    - `assign ... to <agent name>`
    - `@agent-name` mention
  - Pi reboot-safe startup scripts:
    - `bash scripts/pi/mc-start.sh` writes `apps/mission-control/.env.local` from `~/.openclaw/openclaw.json` token, starts Next on `:3001`, and prints `/api/openclaw/status`.
    - `bash scripts/pi/mc-stop.sh` stops the Mission Control dev process on `:3001`.
- Local development on machines without OpenClaw: `INTERFACE_MODE=local npm run dev` (default).
- OpenClaw integration mode (for the target Raspberry Pi 400): `INTERFACE_MODE=openclaw npm run dev`.
- OpenClaw bridge service mode (for real transport wiring): `INTERFACE_MODE=openclaw-bridge npm run dev` (health at `/health`, inbound events at `POST /events`, session orchestration at `POST /sessions/start`, `POST /sessions/end`, `GET /sessions`, transcript history at `GET /sessions/:session_id/transcript`).
- Voice call loop endpoints (bridge mode): `POST /calls/start`, `POST /calls/:call_id/partial`, `POST /calls/:call_id/final`, `POST /calls/:call_id/interrupt`, `POST /calls/:call_id/end`.
  - Reliability note: `POST /calls/:call_id/final` accepts optional `client_turn_id` for idempotent retry-safe responses.
- Realtime bootstrap endpoint (bridge mode): `POST /realtime/session` (requires `OPENAI_REALTIME_ENABLED=true` and `OPENAI_API_KEY`; defaults model to `gpt-realtime-mini` or override with `OPENAI_REALTIME_MODEL`).
- Telephony bootstrap endpoints (bridge mode): `POST /telephony/call`, `POST /twilio/voice`, `POST /twilio/status` (requires `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `TELEPHONY_PUBLIC_BASE_URL`).
- Telephony speech loop endpoint (bridge mode): `POST /twilio/gather` for turn-based phone conversation (default mode via `TELEPHONY_CONVERSATION_MODE=gather`; set `stream` to force Twilio media stream mode on `/twilio/voice`).
- Telephony media stream endpoints (bridge mode): websocket `GET /twilio/media` (upgrade) and diagnostics `GET /telephony/media/sessions`.
- Browser voice client (bridge mode): open `http://127.0.0.1:4318/voice-lab` for microphone + TTS testing against `/calls/*`.
- OpenClaw outbound coverage includes `system.message_send`, `system.voice_speak`, `system.approval_request`, `system.notify_user`, and `system.call_user`.
- Mission Control local panel: `INTERFACE_MODE=mission-control npm run dev` then open `http://127.0.0.1:4317`.
  - Dashboard snapshot API: `GET /api/dashboard` (counts + recent runs/queue/notifications + latency summary).
  - Mission Control APIs include `GET /api/tasks`, `GET /api/tasks/:task_id`, `GET /api/sessions`, `GET /api/sessions/:session_id`, `GET /api/notifications`, `POST /api/notifications/:id/ack`, `POST /api/messages`, and `POST /api/realtime/session`.
  - ClawDeck compatibility APIs are available on the same runtime: `GET/POST /api/workspaces`, `GET/PATCH/DELETE /api/workspaces/:id`, `GET/POST /api/agents`, `GET/PATCH/DELETE /api/agents/:id`, `GET/POST /api/tasks` (workspace-scoped filters supported), `GET/PATCH/DELETE /api/tasks/:id` (compat IDs), `GET/POST /api/events`, `GET /api/openclaw/status`.
  - Pipeline/scheduler APIs: `GET/POST/PATCH /api/jobs`, `POST /api/jobs/:id/run`, `POST /api/jobs/:id/trigger`, `GET /api/job-runs`, `GET /api/job-runs/:run_id`, `GET /api/pipelines/:run_id/graph`, `POST /api/pipelines/:run_id/nodes/:node_id/retry`, `POST /api/pipelines/:run_id/nodes/:node_id/override`.
  - Scheduler mode API: `GET /api/scheduler/mode` (`internal` tick or external `openclaw-cron` trigger mode).
  - Content automation APIs: `GET /api/content/runs/:run_id/results`, `GET /api/post-queue`, `POST /api/post-queue/:id/approve`, `POST /api/post-queue/:id/dispatch`, `POST /api/media/jobs`.
  - Mission Control telephony APIs: `POST /api/telephony/call`, `GET /api/telephony/media/sessions`.
- The core runtime is transport-agnostic via `src/interface/controller.ts`; OpenClaw is an adapter layer.
- Persistence defaults to SQLite at `data/mvp.sqlite` (override with `DB_PATH`).
- Model provider defaults to `MODEL_PROVIDER=local` (provider abstraction added in M5-001).
- OpenAI caller provider mode: `MODEL_PROVIDER=openai` with `OPENAI_API_KEY` (optional: `OPENAI_MODEL`, `OPENAI_BASE_URL`).
- OpenRouter provider mode: `MODEL_PROVIDER=openrouter` with `OPENROUTER_API_KEY` (or `OPENAI_API_KEY`) and optional `OPENROUTER_MODEL`, `OPENROUTER_BASE_URL`, `OPENROUTER_SITE_URL`, `OPENROUTER_APP_NAME`.
- Provider reliability controls (OpenAI/OpenRouter modes): `MODEL_TIMEOUT_MS`, `MODEL_MAX_RETRIES`, `MODEL_FALLBACK_TO_LOCAL` (`true`/`false`).
- OpenClaw bridge host/port controls: `OPENCLAW_BRIDGE_HOST` (default `0.0.0.0`), `OPENCLAW_BRIDGE_PORT` (default `4318`).
- Scheduler controls:
  - `SCHEDULER_MODE` = `internal` (default) or `openclaw-cron`.
  - `SCHEDULER_TICK_MS` (default `60000` ms, used only in `internal` mode).
  - Optional external trigger guard: `MISSION_CONTROL_CRON_TRIGGER_TOKEN` (required header `x-mc-cron-token` on `POST /api/jobs/:id/trigger` when set).
  - Default recurring schedule `FREQ=HOURLY;INTERVAL=1`.
- Content dispatch webhooks: `TIKTOK_DISPATCH_WEBHOOK`, `REELS_DISPATCH_WEBHOOK`, `SHORTS_DISPATCH_WEBHOOK`, optional `POST_DISPATCH_SECRET`.
- Mission Control telephony bridge target: `MISSION_CONTROL_BRIDGE_URL` (default `http://127.0.0.1:4318`).
- Media budget guards: `HIGGSFIELD_MAX_COST_PER_TASK_USD` (default `10`), `HIGGSFIELD_MAX_COST_PER_DAY_USD` (default `50`).

## Source of truth order
1. `SPEC.md`
2. `CONSTRAINTS.md`
3. `OPENCLAW/*`
4. `GOVERNANCE/*`
5. `PERFORMANCE/*`, `RELIABILITY/*`
6. `AGENTS/*`
7. `OPERATIONS/*`
8. `ADR/*`
9. `CHANGELOG/*`
