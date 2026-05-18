# spec-site-brief — features captured during brand decode

**Date:** 2026-05-18
**Scope:** Add an explicit Feature inventory step to /spec-site-brief
that captures (a) third-party integrations the customer already uses and
the demo must preserve, and (b) features the diagnosis says the build
should add. Update /build-demo to consume both lists at pre-flight.
**Branch:** `feat/spec-brief-feature-opportunities`
**Base branch:** `main`
**Depends on:** `chore/import-skills-into-repo` (merged in PR #120 —
puts the skill files in the repo so this edit is reviewable).

## What changed

### Files

- **Modified** `skills/spec-site-brief/SKILL.md` — Phase 2 gains a new
  "Feature inventory" subsection between Photo role mapping and the
  Phase 3 separator. Two arrays defined: `existing_integrations[]`
  (third-party tools the customer already uses) and
  `feature_opportunities[]` (features the diagnosis would benefit from
  adding). Both land in `brand-analysis.json.metadata`, so no ingest
  validator change is needed. Phase 4's brand-analysis.json schema
  example updated to document the metadata shape.
- **Modified** `.claude/commands/build-demo.md` — Pre-flight section
  gains step 6 that reads the two arrays from
  `brand-analysis.json.metadata`. `existing_integrations` is treated as
  non-negotiable (the URLs must appear in the demo per their declared
  `treatment` — embed / link / deep_link). `feature_opportunities` is
  treated as suggestive, with priorities 1-5 dictating whether the
  build allocates a section, a smaller component, or nothing.

### Wire-format

```json
{
  "metadata": {
    "existing_integrations": [
      {
        "name": "Booksy",
        "type": "booking",
        "url": "https://<...>.booksy.com/",
        "treatment": "embed",
        "evidence": "IG bio link points here"
      }
    ],
    "feature_opportunities": [
      {
        "feature": "email_drop_list",
        "rationale": "Diagnosis: owned-audience gap. They post drop announcements but have no email list.",
        "priority": 1
      }
    ]
  }
}
```

Both arrays default to `[]`. Existing leads (urban-cutz, jp-nail) without
these fields continue to build cleanly via the documented fall-back.

## Why

The lead-1 audit (Urban Cutz) made this gap visible. The customer has
Booksy + Fresha already wired; the demo eventually embedded Booksy by
inference but there was no structured field saying "this customer
already uses X, the demo MUST keep it" vs "this customer would benefit
from Y that they don't currently offer". Future builds would either
silently drop a working booking layer (because brand decode didn't
flag it) or invent a feature the owner doesn't want. Capturing both
lists explicitly removes that guesswork.

## Stack

- Markdown only — pure skill prompt edits.
- No code, no schema migration, no new dependencies.

## Integrations

- Inbound: `brand-analysis.json.metadata` reaches NERVE via the
  existing `/api/ingest/brand-analysis` endpoint unchanged (JSONB
  field is already flexible).
- Outbound: none. /build-demo reads from the local sidecar.

## How to verify

```bash
# Re-link skills if not done:
bash scripts/setup-skills.sh

# Run /spec-site-brief on a fresh lead and check the output sidecar:
jq '.metadata.existing_integrations, .metadata.feature_opportunities' \
  ~/Desktop/salespatch-demos/<slug>/outputs/brand-analysis.json
```

End-to-end on a new lead:

1. /spec-site-brief on a business with Booksy/Fresha/Treatwell — confirm
   each surfaces in `existing_integrations` with treatment=embed.
2. /build-demo on the same lead — confirm the demo renders the embed
   (or fallback button) for every existing_integrations entry.
3. POST to `/api/ingest/brand-analysis` succeeds (no validator
   changes); the NERVE row's `metadata` JSONB column carries both
   arrays.
4. On `nerve.salespatch.co.uk/leads/<slug>` the lead-bundle endpoint
   returns the same metadata (a small UI surface follow-up may want
   to render these, but that's separate).

## Known issues

- The NERVE `/leads/[id]` page UI doesn't yet surface these arrays
  visually. A small panel-render follow-up could add them; the data is
  already queryable via `/api/read/lead-bundle?slug=<slug>`.
- Existing pre-feature-capture leads have empty metadata. The
  /build-demo fall-back to brief.md blueprint sections handles them
  cleanly, but a backfill of the urban-cutz / jp-nail metadata would
  let future re-runs of /build-demo emit a richer demo.
- The `feature_opportunities[].rationale` traceability rule ("must
  trace back to a fact captured in Phase 1 or 3") is enforced by the
  skill prompt only — there's no programmatic check. If a future
  agent invents a rationale, the audit chain breaks. A follow-up may
  want a NERVE-side validator that cross-checks against the brief.
