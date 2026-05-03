# NERVE — Stage 3: Research Project section

**Date:** 2026-05-02
**Branch:** `claude/nice-kare-edfa44`

## What changed

The whole `/research/*` subtree — the dissertation evidence half of NERVE.

### Shared
- `src/lib/words.ts` — markdown-aware word counter (strips fenced code, inline code, images, link punctuation, heading hashes, list markers before counting)
- `src/components/Markdown.tsx` — react-markdown wrapper with dense terminal-friendly typography
- `src/lib/evidence.ts` — `resolveEvidenceSource()` walks the polymorphic source-type lookup so the evidence log can show "what is this row pointing at?" with a link to the source detail page
- Widened `Field`'s `hint` prop to `ReactNode` so the live word-count display can be rich

### Sub-nav
- `src/app/(app)/research/_components/SubNav.tsx` — horizontal tab bar across the top of every `/research/*` page

### Dashboard — `/research`
- Dissertation working title and research question prominently up top
- Progress tiles: days to submission · word count · literature count · evidence count
- Data sufficiency table per phase with progress bar and methodology-doc indicator
- Sections table with status, word count, progress bar, revision count
- Sections-by-status counts
- Upcoming deadlines sidebar with overdue badge
- Outstanding supervisor actions sidebar

### Dissertation meta — `/research/dissertation`
- One-row singleton editor (`id="main"`)
- Working title + research question with append-only version history
- Supervisor / submission deadline / overall status
- `?history=1` reveals both version history columns
- Server action wraps the upsert + version inserts in a transaction so a partial save never leaves history out of sync

### Sections — `/research/sections`
- List page: chapter / status / words / target / progress / refs / revs / updated
- New + edit form: chapter, status, target, markdown content (live word counter), supervisor feedback, literature checkboxes
- Detail page: rendered markdown body + sidebar with feedback / linked literature / version history toggle
- Server action saves a `DissertationSectionVersion` only when `content` changed
- CSV + JSON export at `/api/research/sections/export`

### Literature — `/research/literature`
- List with theme tag filter sidebar (with counts) + position filter (supports / challenges / contextualises)
- Search via `?q=`
- Position pills colour-coded
- New + edit form with year, URL, DOI, abstract, theme tags (comma-separated), personal notes (markdown), position
- Detail page: abstract + markdown notes + DOI/URL links + cited-in-sections list
- CSV + JSON export at `/api/research/literature/export`, applies the same filters

### Methodology — `/research/methodology`
- One doc per phase
- Form fields: phase name, formal description (citable), mixed-methods justification, sample size notes, statistical approach, GDPR handling, NERVE-as-infrastructure (pre-populated with a default citable paragraph that describes NERVE as the data-collection layer — direct dissertation methodology text per spec)

### Evidence log — `/research/evidence`
- Polymorphic citation log: sourceType + sourceId → annotation → optional dissertation section
- Source-type whitelist enforced server-side via `_types.ts` (10 supported tables) so the polymorphic table can't end up dangling
- `resolveEvidenceSource()` does the lookup so list and detail show e.g. "PitchLog · The Bothy Bar · closed · hospitality · 2026-05-02"
- Filters: source type, dissertation section
- Detail page links back to the source row with `[unresolved]` flag if the row was deleted
- CSV + JSON export

### Phase boundaries — `/research/phases`
- Methodology timeline editor — list with overlap/gap warnings, full CRUD
- The cache invalidation in `phase.ts` runs after every save so the next webhook fires get the new boundaries

### Supervisor meetings — `/research/supervisor`
- Date, notes, feedback, agreed actions, follow-up status
- List + form + detail
- Outstanding actions surface on the research dashboard

### Academic calendar — `/research/calendar`
- Milestone, deadline, status, optional dissertation-section link
- Overdue items flagged in red on both the list page and the dashboard counter
- Status: pending / in_progress / done / missed

## Why

Per the staged plan and the spec's emphasis on dissertation evidence: every research-project record is also potential dissertation evidence. The evidence log binds operational records (pitches, decisions, failures, financial entries) to dissertation chapters with annotations — so when the founder writes a findings paragraph, the citation chain back to the raw row is one click away. The methodology doc's pre-populated NERVE-as-infrastructure paragraph directly satisfies the spec requirement that "NERVE documents itself."

## Stack

No new deps. `react-markdown` was already installed in Stage 1 — first time it gets used here.

## Integrations

- All 9 entity types embed via the existing pipeline (no-op when `OPENAI_API_KEY` is unset).
- Evidence log's `resolveEvidenceSource()` reads from the same Prisma client; lookup failures degrade gracefully to `[unresolved]`.
- Dissertation meta singleton uses `id="main"` so seeding and upserts are deterministic.

## How to verify

Dev server running on `http://localhost:4400`. Sign in.

1. **Research dashboard** — `/research` shows working title, RQ, progress tiles, data sufficiency table, sections list, deadlines.
2. **Dissertation editor** — `/research/dissertation` displays the seeded title/RQ. Edit it, save, click "show history" — both `WorkingTitleVersion` and `ResearchQuestionVersion` rows appear.
3. **Phase boundaries** — `/research/phases` lists Phase 1. Add a future Phase 2 with a start date — return to dashboard and the data sufficiency table now shows two rows.
4. **Sections** — `/research/sections` shows 7 chapters from the seed. Open Methodology → "edit" → paste prose → live word counter ticks → save → version row appears in history toggle.
5. **Literature** — `/research/literature` shows 4 seeded entries with theme/position filters; theme sidebar counts work.
6. **Methodology** — `/research/methodology` lists Phase 1 doc; click in to read the full methodology text.
7. **Evidence** — `/research/evidence/new`, set sourceType=PitchLog, paste a pitch id from `/sales`, link to a section, write the annotation, save → appears in the list with the resolved title.
8. **Supervisor / Calendar** — `/research/supervisor/new` and `/research/calendar/new` both work; calendar shows overdue badges if you backdate a milestone.

## Known issues / out of scope

- Markdown editor is a textarea — no preview pane, no toolbar. Paste markdown, render on detail.
- Evidence source lookup hits 10 tables one at a time. Acceptable at this scale; if it gets slow, batch by sourceType.
- Section literature linking uses a checkbox list which is fine for ~50 references but will need a search UI past that.
- Phase boundary cache invalidates in-process only. Multi-instance deploys (we're single-instance on Vercel) would need a shared signal.
- Research dashboard "outstanding supervisor actions" surfaces the last 3 meetings' agreed actions; not a real Kanban — just flags them while the meeting is fresh.
