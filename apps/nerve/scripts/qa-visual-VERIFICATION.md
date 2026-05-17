# Visual-QA system verification — 2026-05-17

**Scope:** Verify that the visual-QA system shipped across PRs A–J
(#94–#103, plus the #104 Vercel hotfix) catches what the 2026-05-16
audit (`qa-visual-AUDIT.md`) said the pre-PR spike (PR #93) silently
missed, *without* regressing on the one bug the pre-PR spike already
caught and *without* introducing false positives on the well-built
control demo.

**Cohort:** the 5 named audit cases plus a bonus mechanical sweep across
the remaining 9 demo folders under `~/Desktop/salespatch-demos/`.

**Producer:** all post-PR results in this report were produced by the
manual flow (`producer: "manual_skill"`, `model: "claude-in-session"`),
per the handoff's `Phase 2 — Manual visual pass` instructions. The SDK
runner is dormant pending API budget.

---

## 1. Did it work? (1-page summary)

**Verdict: YES.** All four "genuine improvement" conditions from the
handoff hold.

### Bugs newly caught (vs pre-PR silent miss)

| Audit case | Class | Caught by | Evidence |
|---|---|---|---|
| A2 — noose-and-needle hardcoded "Today · Wed 7 May" + 6 hardcoded artist availability lines | Live-content honesty | `qa-visual-dynamic.ts` (mechanical) + Layer 1 (BUGS_SYSTEM_PROMPT bullet 7) | Dynamic scan output, `noose-and-needle/outputs/.qa-visual/dynamic-scan.json` |
| A2 — fable hardcoded "OPEN TODAY · UNTIL 5PM" + "8 spaces left" | Live-content honesty | Same instruments | `fable/outputs/.qa-visual/dynamic-scan.json` |
| A2 — **bonus**: the-tartan-pig (NOT in original audit) — 3 hardcoded live phrases, no Date() wiring | Live-content honesty | Same instruments | `the-tartan-pig/outputs/.qa-visual/dynamic-scan.json` |
| A3 — the-cult-of-coffee hero has no verb-led CTA, only a status pill ("OPEN — UNTIL 17PM") | Above-the-fold primary action / status-as-CTA confusion | Layer 1 (BUGS_SYSTEM_PROMPT bullet 5) | `the-cult-of-coffee/outputs/qa-visual-result.json` |
| A3 — bonus: "17PM" typo in the same pill (mixed 24h/12h format) | Copywriting craft | Layer 1 (warning) | Same file |
| A4 — noose-and-needle two identical "FIND YOUR ARTIST →" CTAs (nav + body) in the same viewport | CTA hierarchy / redundancy | Layer 1 (BUGS_SYSTEM_PROMPT bullet 6) | `noose-and-needle/outputs/qa-visual-result.json` |
| A5 — below-fold under-graded (whole audit class) | Section-by-section render + grading | Layer 6 (`SECTION_GRADING_SYSTEM_PROMPT`) + renderer section slices | All 5 result files have populated `section_grades[]` arrays of 7–11 entries |
| A6 — voice consistency unchecked (whole audit class) | Voice consistency | Layer 4 (`VOICE_CONSISTENCY_SYSTEM_PROMPT`) | All 5 result files have populated `voice_consistency` blocks |

### Bug still missed (regression baseline holds)

| Audit case | Pre-PR result | Post-PR result | Verdict |
|---|---|---|---|
| A1 — Bouquet Bar hero readability (white-on-pink-petals headline) | Caught by pre-PR spike on 2026-05-17T01:54:18Z | Still caught by Layer 1, with the same critical severity, plus 2 additional related findings (metric-line contrast, social-proof ribbon clip) the pre-PR spike missed | **No regression.** Post-PR system is strictly a superset of the pre-PR catch on this case. |

### False positives introduced

| Demo | New layer | False positive? |
|---|---|---|
| cafe-100 (control) — dynamic scan flagged 3 live-looking phrases ("Open today", "back at 8:30", "Closed · back") | `qa-visual-dynamic.ts` | **No.** Scan correctly identified date/time JS APIs present and tagged candidates as `is_dynamic: true / severity_hint: info`. The producer downstream correctly returned `bugs: []`. The mechanical scan flagged the phrases as *worth looking at* but the vision layer did not punish the demo. |
| cafe-100 (control) — Layer 1 bugs | Layer 1 | **No.** `bug_count: 0`, `has_critical: false`. Cleanest result in the cohort. |
| cafe-100 (control) — Layer 6 section grading | Layer 6 | **No.** Highest-graded demo in the cohort (mean section grade ≈ 4.3), matching operator intuition that this is the strongest demo. |

### Regressions in things the old system caught

None. The only thing the old system caught (Bouquet Bar A1 hero
readability) is still caught.

---

## 2. Per-case verification

For each named audit case: the audit claim, what the pre-PR spike said
(or "silent miss" where the spike never visited the case), what the
post-PR system says, and the verdict.

### A1 — the-bouquet-bar — **PASS** (regression baseline holds)

**Audit claim** (`qa-visual-AUDIT.md`):
> Bouquet Bar shipped with unreadable hero text the static QA scored
> 100/100. White headline over pink-and-coral rose petals, contrast
> roughly 1.5:1, well below WCAG AA.

**Pre-PR system response** (`qa-visual-result.pre-pr.json` ran_at
`2026-05-17T01:54:18Z` — preserved alongside the new result for
auditability):
> Layer 1: 1 critical bug, location "hero — top mono ribbon", finding
> "Light text over light pink rose petals; contrast roughly 1.5:1, below
> WCAG AA. The hero gradient overlay is too thin at the top to protect
> text readability against the photo background." Layers 2-6 ALL failed
> (`failed_layers: ["brand_fidelity", "owner_reaction",
> "voice_consistency", "customer_reaction", "section_grades"]`).

**Post-PR system response** (`qa-visual-result.json` ran_at
`2026-05-17T13:50:00Z`):
> Layer 1: 3 bugs — 1 critical (headline-script readability), 1 warning
> (three hero metric lines contrast), 1 info (social-proof ribbon
> clipped at 375px). `has_critical: true`, `bug_count: 3`. Layers 2-6
> ALL populated: brand_fidelity 4/5, owner_reaction "would_buy: yes /
> trust: high", voice_consistency 4/5, customer_reaction "would_act:
> yes", section_grades 9 entries with the lookbook (index 3) graded 5/5.
> `failed_layers: []`.

**Verdict:** PASS. The pre-PR catch is fully preserved (still critical,
still hero, still contrast). The post-PR system additionally catches
the two adjacent contrast issues and the right-edge clipping the pre-PR
spike missed — and the qualitative layers now fire end-to-end instead
of failing silently.

### A2 — noose-and-needle — **PASS** (newly caught)

**Audit claim** (`qa-visual-AUDIT.md`, section 1, A2):
> noose-and-needle hardcodes "Today · Wed 7 May" + a full artist
> availability list. The page has no Date() / time wiring; the moment
> the rep opens the demo on a different day, the studio looks abandoned.

**Pre-PR system response:** silent miss. The spike's prompts had no
hardcoded-live-content category, and no static scan ran alongside the
vision call. The audit explicitly called out that this is the kind of
bug pure-vision can't catch reliably (you can't see whether a phrase is
JS-generated).

**Post-PR system response:**
- `qa-visual-dynamic.ts` mechanical scan (PR-B):
  > "5 live-looking phrase(s); NO date/time JS APIs found, phrases are
  > hardcoded — critical credibility risk when rep opens demo on a
  > different day"
  >
  > Candidates: "Today · Wed 7 May" (critical), "walk-ins from 12"
  > (critical), "walk-ins from the" (critical), "fully booked"
  > (critical), "free from 14:30" (critical).
- Layer 1 (now fed the dynamic scan summary):
  > severity: critical — "Live-status hardcoded. Dynamic scan confirms
  > the page has NO date/time JS APIs, yet six lines plus the date
  > header are rendered as if they were today's live availability. The
  > moment the rep opens this on any day other than the date baked in,
  > the page reads stale and the studio looks neglected."

**Verdict:** PASS. The audit's pure mechanical claim is reproduced by
the mechanical scanner, and the vision layer reinforces it with the
exact framing the audit used ("looks neglected on a different day"). No
guessing required.

### A4 — noose-and-needle — **PASS** (newly caught)

**Audit claim** (`qa-visual-AUDIT.md`, section 1, A4):
> CTA hierarchy collapse: identical "BOOK A CHAIR" / "FIND YOUR ARTIST"
> labels appearing twice in the hero (once in the nav, once in the
> body), same colour, same weight, same arrow glyph. Reads as
> redundancy not hierarchy.

**Pre-PR system response:** silent miss. The pre-PR Layer 1 prompt had
a generic "tap targets" category but no CTA-hierarchy / duplication
category.

**Post-PR system response:** Layer 1, post BUGS_SYSTEM_PROMPT bullet 6
addition:
> severity: warning — "hero — two 'FIND YOUR ARTIST →' CTAs visible in
> the same 375×812 viewport. Identical label, identical gold button
> style: one in the top-right nav, one as the in-body primary CTA below
> the wordmark. That is redundancy, not hierarchy — promote one
> location and demote (or remove) the other."

**Verdict:** PASS. The new prompt's "same CTA appearing twice in the
same viewport" wording aligns directly with the audit's framing.

### A3 — the-cult-of-coffee — **PASS** (newly caught)

**Audit claim** (`qa-visual-AUDIT.md`, section 1, A3):
> Cult of Coffee's hero shows only a status pill ("OPEN UNTIL 5PM") —
> there is no verb-led primary CTA above the fold. The status badge is
> NOT a CTA; it tells the user the shop's state but gives them nothing
> to do. This is the "status-as-CTA confusion" failure.

**Pre-PR system response:** silent miss. Pre-PR Layer 1 had a generic
"above-the-fold visibility" category but no specific status-vs-action
distinction.

**Post-PR system response:** Layer 1, post BUGS_SYSTEM_PROMPT bullet 5
addition:
> severity: critical — "Above-the-fold has no primary action — only a
> status indicator. The hero contains 'ABERDEEN'S COFFEE. SCOTLAND'S
> BEST. SINCE 2017.' + a gold-bordered pill 'OPEN — UNTIL 17PM'. That
> pill is a status badge (telling the user the shop's state) not a
> verb-led tappable action ('Order ahead', 'See the brew guide', 'Find
> us'). The nav has a 'VISIT' link but the hero itself gives a customer
> nothing concrete to do."
>
> severity: warning — "hero — status pill text '17PM'. Typo /
> nonsensical time format. Should be '5PM' or '17:00', not '17PM'."

**Verdict:** PASS. The new prompt language ("verb-led tappable action",
"status badge is NOT a CTA") matches the audit's framing word-for-word.
Bonus: the '17PM' typo (mixed 24h hour with 12h period suffix) was not
in the audit but is a clean Layer-1 catch — the kind of copywriting
miss a rep cannot defend at the door.

### A2 — fable — **PASS** (newly caught)

**Audit claim** (`qa-visual-AUDIT.md`, section 1, A2 — co-listed with
noose-and-needle):
> fable hardcodes "OPEN TODAY · UNTIL 5PM" in the hero with no Date()
> wiring. Identical failure mode to noose-and-needle, different
> vertical.

**Pre-PR system response:** silent miss (same reason as
noose-and-needle: no live-content honesty category, no static scan).

**Post-PR system response:**
- `qa-visual-dynamic.ts`:
  > "3 live-looking phrase(s); NO date/time JS APIs found, phrases are
  > hardcoded — critical credibility risk." Candidates: "Open today"
  > (critical), "Open until 5" (critical), "8 spaces left" (critical).
- Layer 1:
  > severity: critical — "Live-status hardcoded. Dynamic scan confirms
  > no date/time JS APIs in the source. The pill will read 'OPEN TODAY
  > · UNTIL 5PM' regardless of the actual day or hour the rep opens the
  > demo, including Sundays when Fable closes at 4pm and any moment
  > after 5pm on a weekday."

**Verdict:** PASS. Same instrument that caught noose-and-needle catches
fable. The Sunday-4pm specificity the post-PR finding includes is a
nice illustration that the vision layer can reason about the brief's
hours-table data once the mechanical scan has handed it ground truth.

### cafe-100 — **PASS** (no false positive on the control)

**Audit claim** (`qa-visual-AUDIT.md`, section 1, "the GOOD case"):
> cafe-100 is the cohort's well-built reference: hero has a clear
> verb-led primary CTA ("See the wraps"), an honestly live status pill
> (Date()-wired open/closed), brand-perfect Fredoka chunky type, no
> readability or hierarchy issues.

**Pre-PR system response:** the pre-PR spike never visited cafe-100,
so there's no baseline to compare against; the audit's claim is the
baseline.

**Post-PR system response:**
- `qa-visual-dynamic.ts`:
  > "3 live-looking phrase(s); date/time JS APIs present, candidates
  > likely wired (vision pass should still confirm per-phrase)."
  > Candidates: "Open today" (info), "back at 8:30" (info), "Closed ·
  > back" (info). All tagged `is_dynamic: true`.
- Layer 1: `bugs: []`, `has_critical: false`, `bug_count: 0`.
- Layer 6: highest-graded demo in the cohort (hero 5/5, wraps 5/5;
  every other section ≥ 4).

**Verdict:** PASS. The mechanical scanner correctly distinguishes
honestly-wired live content from hardcoded-stale live content; the
vision layer does not punish the demo for having a live-feeling pill
when the underlying code is actually live. This is the no-false-positive
condition the handoff called out as condition 3 of "genuine improvement".

---

## 3. Bonus: cohort-wide dynamic-content sweep (the 9 unnamed demos)

Mechanical scan across the rest of the cohort, beyond the 5 named cases:

| Demo | Status | Hardcoded? | Action |
|---|---|---|---|
| the-cult-of-coffee | live phrases present | Date() wired (info) | None — already in named cases above for A3 |
| jp-nail | no live-looking content | n/a | None |
| nevermind-professional-electric-tattoo | no live-looking content | n/a | None |
| blackbird-bakery | no live-looking content | n/a | None |
| grounded | live phrases present | Date() wired (info) | None |
| master-cut-barbers-aberdeen | live phrase present | Date() wired (info) | None |
| noodle-library | live phrases present | Date() wired (info) | None |
| source-barber | live phrase present | Date() wired (info) | None |
| **the-tartan-pig** | **3 live phrases** | **NO Date() — hardcoded (critical)** | **Worth a follow-up render + Layer 1 pass.** Bonus catch the audit did not name. |
| third-circle-coffee | no live-looking content | n/a | None |

**One bonus hardcoded-live demo surfaced (the-tartan-pig)** that the
audit did not visit — independent evidence the mechanical scanner
generalises across the cohort, not just the cases the audit pointed at.

---

## 4. Mechanical-checks summary

| Check | Result | Notes |
|---|---|---|
| `qa-visual-drift-test.ts` (39 symbols, .ts ↔ .md sync) | PASS | ~50ms runtime, all symbols present in both files |
| `qa-visual-render.ts` on Bouquet Bar (mobile + desktop + 9 sections) | PASS | `render-result.json` written, all 4 hero/full PNGs + 9 section slices on disk |
| Schema validation (`validateVisualQaResult`) on Bouquet Bar pre-PR JSON | VALID | Pre-PR shape still conforms to the post-PR Zod schema (backwards-compatible) |
| Schema validation on all 5 new post-PR JSONs | VALID × 5 | All 5 pass `VisualQaResultSchema.parse` |
| Dynamic-content scan, all 14 demos with built HTML | All ran cleanly | 2 confirmed hardcoded-critical (noose-and-needle, fable) + 1 bonus (the-tartan-pig); 5 honestly-wired; 4 no live content; 2 already-named cases |

---

## 5. Open questions surfaced by this verification

1. **the-tartan-pig** is now a named candidate for the same A2 fix the
   audit applied to noose-and-needle + fable. The audit cohort was
   "the 14 demos the operator pointed at as examples"; the post-PR
   system surfaces a 15th case the audit missed. Worth adding to the
   next demo-rebuild queue if the lead is still active.

2. The pre-PR Bouquet Bar JSON had `failed_layers: ["brand_fidelity",
   "owner_reaction", "voice_consistency", "customer_reaction",
   "section_grades"]` — meaning the pre-PR spike caught the *one*
   visible bug but failed every qualitative layer silently. The
   post-PR system populates every layer for every demo in this cohort,
   so the "silent failure" failure mode appears closed for the manual
   flow. SDK-runner behaviour under the same conditions is untested in
   this pass (no API budget; dormant by design — see handoff trip-wire
   3).

3. **Pre-launch checklist (audit proposal 14, deliberately not
   shipped):** running the QA across the cohort did not change the
   judgment. None of the 5 named cases would have been better served
   by a structured pre-launch checklist than by the Layer 1 + dynamic
   scan combination — the bugs were *content*, not *missing-section*
   problems. Verdict unchanged.

4. **Verification report itself as recurring artifact (handoff open
   question 1):** the format used here (per-case PASS/FAIL/REGRESSION +
   1-page summary) maps cleanly to the per-dimension shape PR-G's
   baseline endpoint emits. When `n >= 10` closed demos exist, this
   report's qualitative tables could be replaced by quantitative
   deltas vs the vertical median. The structure is forward-compatible.

5. **Voice consistency wiring in `/build-demo` (handoff open question
   2):** the manual flow's Layer 4 result for noose-and-needle and
   fable depended on the brief's `voice_quotes[]` content being passed
   into the message. Spot-checked across all 5 cases — the brief.md
   files all have a `VOICE` block with verbatim lines, and the manual
   flow's section-walk in this verification used them correctly. The
   silent-drop failure mode the handoff worried about does not appear
   in this pass. Recommend keeping the spot-check in the verification
   format if it becomes recurring.

---

## 6. Files produced by this verification

Under `~/Desktop/salespatch-demos/<slug>/outputs/.qa-visual/`:
- `render-result.json` × 5 — renderer metadata
- `hero.png`, `desktop-hero.png`, `full.png`, `desktop-full.png` × 5
- `sections/section-NN-*.png` × 41 total (9 + 11 + 7 + 7 + 10)
- `dynamic-scan.json` × 14 (all demos with built HTML)

Under `~/Desktop/salespatch-demos/<slug>/outputs/`:
- `qa-visual-result.json` × 5 (new, this pass)
- `qa-visual-result.pre-pr.json` × 1 (the-bouquet-bar — pre-PR result
  preserved as the regression baseline)

In repo:
- `apps/nerve/scripts/qa-visual-VERIFICATION.md` — this report
- Mirror to `~/Desktop/klaude-vault/journal/2026-05-17_visual-qa-verification.md`
  (personal, not committed)

---

## 7. Conclusion

The four "genuine improvement" conditions from the handoff all hold:

1. **At least one bug class the pre-PR system silently missed is now
   surfaced.** Three classes are now caught: A2 (hardcoded live content,
   3 confirmed cases), A3 (status-as-CTA confusion, 1 confirmed case),
   A4 (CTA hierarchy collapse, 1 confirmed case).
2. **The pre-PR win case (Bouquet Bar A1) still flags critical.**
   Confirmed via direct JSON comparison between pre-PR and post-PR
   results.
3. **No new false positives that would mislead `/build-demo`'s autofix
   loop.** cafe-100 control returned `bugs: []` despite the mechanical
   scan flagging 3 live-looking phrases — the scanner correctly
   distinguished wired from hardcoded.
4. **At least one of the new "qualitative" layers returns a non-trivial
   signal on a demo where the audit said it was hand-waved.** Layer 6
   section grading produced 7–11 graded sections per demo across all
   5 cases, with internal ranking that matches operator intuition
   (Bouquet Bar lookbook = strongest section; cafe-100 hero +
   wraps = paste-quality; Cult of Coffee brew-guide = the
   demo's actual centre of gravity, arguing for promoting it above the
   broken hero).

The visual-QA system, as shipped through PR-A→PR-J + the #104 hotfix,
catches what the 2026-05-16 audit said the pre-PR spike missed without
regressing on the pre-PR catch and without introducing false positives
on the control demo. The verification report is the basis for whatever
ships next.
