---
description: Top-up scrape of Instagram + Fresha + Google/Mapillary photos for a lead. Primary photo fetching now happens inside /spec-site-brief Phase 1.5 — run this command only for post-brief top-up, retries after rate limits, or fresh photo pulls on existing leads.
argument-hint: [business slug, e.g. "bandit-bakery" — or leave blank to use the most recent ~/Desktop/salespatch-demos/ folder]
---

**When to use this command:**

- **Re-run on an existing lead** to refresh photos (e.g. Fresha updated their listing)
- **Top up after Instagram rate-limited** the original brief run
- **Manual override** — you want to pull Fresha/Mapillary for a lead whose brief was written before Phase 1.5 existed

**When NOT to use this command:**

- During a fresh lead workflow — `/spec-site-brief` now auto-fetches Fresha + Mapillary photos as Phase 1.5, before brand decode runs. Running `/grab-photos` before the brief is unnecessary and running it after duplicates work.

Target: 15–30 photos in `~/Desktop/salespatch-demos/<slug>/photos/`, with
provenance preserved in the filenames.

Do NOT use Apify, paid scrapers, or any metered service. The user has been
burned twice. Only free, login-free tooling.

## 1. Resolve the lead folder

In this order:
1. If `$ARGUMENTS` is a slug, use `~/Desktop/salespatch-demos/$ARGUMENTS/`.
2. If empty, list `~/Desktop/salespatch-demos/*/` and pick the most recently
   modified one.

If the folder doesn't exist, tell the user to run `/new-lead` first and stop.

## 2. Resolve sources

Sources resolution is now **auto-populated from `brief.json` if it exists**.
Only fall back to chat prompts if the brief hasn't been written yet or the
field is null.

**Step 2a — Auto-populate from brief.json (zero-prompt path):**

```bash
LEAD_DIR="$HOME/Desktop/salespatch-demos/<slug>"
BRIEF="$LEAD_DIR/outputs/brief.json"

INSTAGRAM=""
FRESHA=""
LATLNG=""

if [ -f "$BRIEF" ]; then
  INSTAGRAM=$(python3 -c "
import json
try:
    d = json.load(open('$BRIEF'))
    h = d.get('instagram_handle')
    print('@' + h if h else '')
except Exception:
    pass
")

  # Fresha URL: regex out of brief_markdown since it's not a structured field.
  FRESHA=$(python3 -c "
import json, re
try:
    d = json.load(open('$BRIEF'))
    md = d.get('brief_markdown', '')
    m = re.search(r'https://[^\s\)\]]+fresha\.com/[^\s\)\]]+', md)
    print(m.group(0) if m else '')
except Exception:
    pass
")

  # lat,lng: pull from metadata.enrichment.geocode (Phase 0 output)
  LATLNG=$(python3 -c "
import json
try:
    d = json.load(open('$BRIEF'))
    geo = (d.get('metadata') or {}).get('enrichment', {}).get('geocode', {})
    lat = geo.get('lat'); lng = geo.get('lng')
    print(f'{lat},{lng}' if lat and lng else '')
except Exception:
    pass
")
fi
```

**Step 2b — Fallback to sources.json or chat prompts only if needed:**

If `INSTAGRAM`, `FRESHA`, and `LATLNG` are ALL empty after Step 2a, the brief
hasn't been written yet (or this is a pre-enrichment lead). Then:

1. Read `<lead-folder>/sources.json` if it exists.
2. If missing, ask the user in chat for each source ("skip" allowed), and
   write `sources.json` so re-runs don't re-ask.

If only ONE field is missing after Step 2a (e.g. brief found but no Fresha URL
in the prose), don't ask the user — just proceed without that source. The brief
is the source of truth.

## 3. Run the scrapers

For each source that has a value, run the corresponding helper. They all write
into `<lead-folder>/photos/` with prefixed filenames so `/build-demo` and
`/spec-site-brief` see them as a flat set.

```bash
LEAD_DIR="$HOME/Desktop/salespatch-demos/<slug>"
PHOTOS="$LEAD_DIR/photos"
SCRIPTS="$HOME/.claude/scripts/grab-photos"

# Instagram — anonymous (no login). Expect 5-12 photos per profile.
[ -n "<ig_handle>" ]  && bash "$SCRIPTS/grab-ig.sh"     "<ig_handle>"  "$PHOTOS"
# Fresha — public HTML scrape.
[ -n "<fresha_url>" ] && bash "$SCRIPTS/grab-fresha.sh" "<fresha_url>" "$PHOTOS"
# Street-level exterior — Mapillary (free, opt-in) + Street View (off by default).
[ -n "<latlng>" ]     && bash "$SCRIPTS/grab-google.sh" "<latlng>"     "$PHOTOS"
```

Each helper prints `source: N photos → <dest>` to stderr on success. If a helper
exits non-zero, surface the error but continue with the remaining sources —
partial photos are still useful.

## 4. Log it

Append one line per source actually run to `<lead-folder>/logs/run.jsonl`:

```json
{"ts":"<ISO 8601 UTC>","stage":"grab-photos","source":"instagram","count":7,"slug":"<slug>"}
```

## 5. Report

Print exactly:

1. `✓ Grabbed N photos into ~/Desktop/salespatch-demos/<slug>/photos/`
   (where N is the total file count after running)
2. One bullet per source actually run, showing the count per source.
3. If IG returned < 5 photos: a one-line note suggesting the user manually
   top up from the IG profile.
4. `Next: run /spec-site-brief or paste the business name into chat.`

No preamble. No commentary on the scrape itself unless something failed in a way
the user needs to act on.

## Notes on what to expect (read once)

- **Instagram (`grab-ig.sh`)** — `instaloader` without login. IG rate-limits by
  IP after a small number of profile fetches per hour, so expect **5-12 photos**
  per profile and one usable run per ~30 min from the same IP. If you hit 401 or
  "Please wait" errors, just wait and retry later. No money risk, no account
  risk. Bootstraps a Python venv on first run (~30s, one-time).
- **Fresha (`grab-fresha.sh`)** — pure HTML scrape. No auth, no cost. Will
  silently break the first time Fresha changes their markup.
- **Google (`grab-google.sh`)** — Mapillary by default (free open imagery; needs
  a free `MAPILLARY_ACCESS_TOKEN` from mapillary.com/dashboard/developers, no
  card). Street View Static is OFF unless `GOOGLE_STREETVIEW_API_KEY` is set,
  and even then capped to 4 calls/lead + 50/month. A runaway loop cannot bill
  more than ~£0.35.
