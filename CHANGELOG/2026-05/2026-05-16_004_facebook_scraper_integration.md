# spec-site-brief — Apify Facebook page + posts integration in Phase 1.5

## What changed

- `~/.claude/scripts/apify/facebook-page.sh` (user-level, not in repo) —
  REWROTE the dead HTTP-API stub as an MCP-era downloader. New signature
  `facebook-page.sh <slug> <dest_dir> [items.json]`. Accepts both the
  list-of-pages shape (the actor's native output) and a single page object.
  Filenames: `fb_<slug>_logo.jpg` (from `profilePictureUrl`) and
  `fb_<slug>_cover.jpg` (from `coverPhotoUrl`).
- `~/.claude/scripts/apify/facebook-posts.sh` (user-level, not in repo) —
  NEW MCP-era downloader. `facebook-posts.sh <slug> <dest_dir> [items.json]`.
  Walks each post's `media[]` (preferring `photo_image.uri`) and
  `attachments[]` (preferring `image.uri`). Multi-photo posts get `_1`,
  `_2` suffixes. `FB_SKIP_VIDEOS=1` env var drops video posts entirely
  (default keeps the cover frame, mirroring the IG wrapper).
- `~/.claude/skills/spec-site-brief/SKILL.md` (user-level, not in repo) —
  - Phase 1 verify: new "Facebook page URL" bullet inserted right before
    "Instagram presence". Documents where to look (IG bio, Google Business
    Profile, website footer) and warns against guessing the slug.
  - Phase 1.5 photos: new "Facebook page + posts (via Apify MCP)"
    sub-section, inserted between Google Maps and Instagram. Five-step
    pattern: call `apify/facebook-pages-scraper` → save + run page wrapper
    → call `apify/facebook-posts-scraper` → fetch + save + run posts
    wrapper → compute `fb-recency.json` aggregates. The recency snippet
    mirrors the IG one (PR #83) and writes to `.cache/fb-recency.json`.
  - Phase 4 lead-profile.json schema: added four new metadata fields —
    `fb_url`, `fb_likes`, `fb_last_post_at`, `fb_posts_last_90d`. Stuffed
    into `metadata` rather than promoted to first-class columns; a future
    NERVE migration PR can promote them mirroring PR #83's pattern.
  - Post-Phase-1.5 summary line updated to include "auto Google Maps +
    auto Facebook" sources alongside the existing Fresha / Mapillary / IG.

## Why

The handoff from session 2026-05-16 22:00 flagged this as the blocking
issue for Path C: `/spec-site-brief` Phase 1.5 had IG, Google Maps, Fresha,
and Mapillary photo sources but no Facebook integration. The existing
`facebook-page.sh` was a dead HTTP-API stub from the pre-MCP era — the
account has 401/402 on every direct Apify HTTP call now. Path C operators
(established Facebook-led, low-IG demographic added in PR #91) put their
brand on Facebook, not Instagram. Running the brief skill on a Path C lead
without Facebook scraping tests Path C with the wrong fuel — the demo
ships against whatever scraps Google + Mapillary surface, the brand decode
is thin, and Path C's conversion thesis goes untested.

The Bouquet Bar (Bridge of Don florist surfaced in the latest hunt before
the handoff) is the live test case waiting for this PR: 586 IG followers
but 1,012 FB likes + 34 active FB reviews. Without Facebook scraping the
brief would brand-decode against an IG profile that doesn't represent the
business.

## Stack

User-level Bash + Python (matches the existing `~/.claude/scripts/apify/`
patterns from PRs #80, #81). Apify MCP (already authenticated). No NERVE
schema changes — FB metadata lands in `lead_profiles.metadata` for now.
A follow-up PR can promote `fb_*` to first-class columns with a migration
mirroring `19_ig_post_recency`.

## Integrations

- Apify Store actor `apify/facebook-pages-scraper` — official Apify, 99.8%
  success rate, 44k+ users, $0.01/page (BRONZE). Returns page metadata
  (likes, followers, intro, categories, contact, profile + cover photos).
- Apify Store actor `apify/facebook-posts-scraper` — official Apify, 99.7%
  success rate, 69k+ users, $0.001 actor start + $0.004/post (BRONZE).
  Returns post text, timestamps, engagement, and media (photos + videos).
- Existing Apify MCP server registration (`apify` MCP).

Combined cost per lead: 1 page + 50 posts ≈ $0.211 ≈ £0.17. Well under the
£0.50 per-lead cap in `~/.claude/scripts/apify/lib.sh`.

## How to verify

1. Confirm wrappers exist and are executable:
   ```bash
   ls -la ~/.claude/scripts/apify/facebook-page.sh \
          ~/.claude/scripts/apify/facebook-posts.sh
   ```
2. Smoke-test `facebook-page.sh` with a synthetic payload:
   ```bash
   echo '[{"pageName":"Test","profilePictureUrl":"https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png","coverPhotoUrl":"https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png","likes":1012}]' \
   | bash ~/.claude/scripts/apify/facebook-page.sh "test" /tmp/fb_test
   ls /tmp/fb_test
   ```
   Expect: `fb_test_logo.jpg` + `fb_test_cover.jpg`.
3. Smoke-test `facebook-posts.sh` with a synthetic posts array:
   ```bash
   cat > /tmp/fb_posts.json <<'JSON'
   [{"postId":"pfbid0xyz123abc","time":"2026-05-10T10:00:00Z","media":[{"__typename":"Photo","photo_image":{"uri":"https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png"}}]}]
   JSON
   bash ~/.claude/scripts/apify/facebook-posts.sh "test" /tmp/fb_posts /tmp/fb_posts.json
   ls /tmp/fb_posts
   ```
   Expect: `fb_test_id0xyz123abc.jpg` (last 12 alphanumeric chars of `postId`).
4. End-to-end on The Bouquet Bar (or any Path C lead):
   - Run `/new-lead "The Bouquet Bar"` to scaffold the folder.
   - Run `/spec-site-brief "The Bouquet Bar"`. Verify Phase 1 captures
     a Facebook URL. Verify Phase 1.5 calls both Apify Facebook actors
     and that `fb_*.jpg` files appear in `photos/`.
   - Confirm `outputs/lead-profile.json` has the four `fb_*` fields
     populated under `metadata`.

## Known issues

- The actor input takes `startUrls` only — no slug shorthand. The skill
  must pass a fully-qualified URL. The Phase 1 bullet warns the brief
  writer not to invent a slug.
- `apify/facebook-posts-scraper` returns a `datasetId`. The inline
  preview is capped before all 50 posts; the skill must round-trip
  through `mcp__apify__get-dataset-items` to get the full set. The
  `fields` parameter (`postId,time,timestamp,text,likes,shares,comments,
  media,attachments`) keeps the payload compact.
- `media[]` shape varies between Photo and Video posts. The wrapper
  prefers `photo_image.uri` but falls back to `thumbnail` and to
  `attachments[].image.uri` to handle older / link-share post shapes.
  `FB_SKIP_VIDEOS=1` drops video posts entirely; default keeps the
  cover frame because for spec-site demos any visual of the business
  is useful.
- Recency aggregates use the `time` ISO field (not the `timestamp` unix
  int) so they match the IG snippet's pattern exactly. Honest-null
  contract: `fb_posts_last_90d` is `null` if the scraped window is
  shorter than 90 days.
- FB metadata fields land in `lead_profiles.metadata` rather than as
  queryable columns. A follow-up PR will add a migration mirroring
  PR #83 (`ig_post_recency`) to promote `fb_likes`, `fb_last_post_at`,
  `fb_posts_last_90d`, and `fb_url` to first-class columns.
- The skill's "When to run" rule fires on URL presence rather than
  explicit Path letter. This intentionally over-runs on Path A indies
  who happen to have an old FB page — the marginal £0.17 cost is worth
  the chance of pulling a usable logo / cover photo even when IG is
  the primary brand surface.
