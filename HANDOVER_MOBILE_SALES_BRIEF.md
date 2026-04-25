# Handover — Surface new sales-brief fields in the mobile lead view

Paste this file into the fresh Claude Code thread that owns the mobile
worktree (mobile-api + iOS lead view).

---

## What just happened

The admin side (`/admin/leads` on the sales-dashboard at
`https://salesflow-sigma.vercel.app`) now accepts a new Claude Desktop
pitch-strategist JSON. The strategist outputs a tactical pitch brief
designed for a door-to-door closer — not just business info.

Seven new fields are written into `lead_assignments.notes` (JSON blob)
alongside the existing ones. Because the mobile API reads from the same
Supabase `lead_assignments` table, **the data is already flowing** — you
just need to expose and render it.

---

## The new fields (inside `notes` JSON)

```jsonc
{
  // ...existing fields (business_name, google_rating, services, etc.)

  // The single sharpest reason this business needs a site.
  // ≤18 words. Always render prominent.
  "hook": "Amy runs monthly book clubs that fill up — every booking goes through DMs and she turns people away.",

  // Exact first line the rep says walking in.
  // ≤30 words. Should be displayed as a quote, not summarised.
  "opener": "Hi, is Amy in? I'm Kevin. I noticed Fable's got 5.0 from 60 reviews and I thought you'd want to see something we built.",

  // 3 specific things to tap/point out during the demo.
  // Each ≤14 words. Render as numbered or arrow-prefixed cards.
  "demo_moments": [
    "Tap Events — show Amy she can take book-club bookings here.",
    "Scroll to hours — point out the Sunday discrepancy on Google.",
    "Tap Buy Gift Cards — live on their custom domain."
  ],

  // 3–4 tailored objection + response pairs (not generic fallbacks).
  // objection ≤12 words, response ≤28 words.
  // Render as collapsible Q/A cards or inline Q→A pairs.
  "specific_objections": [
    {
      "objection": "Instagram works fine for me",
      "response": "Fair. How many DMs did you miss last weekend? A site takes bookings while you sleep."
    }
  ],

  // The exact ask. ≤40 words. Names the price. Offers a concrete next step.
  "close_script": "It's £350 and we can have it live by Friday. I can take a card number now or come back Thursday — which works?",

  // Recovery line if today is a no. ≤25 words. Value for them, not a guilt trip.
  "next_visit_reason": "Fine. Can I drop back Thursday — by then I'll have the live search-ranking numbers for 'bookshop Aberdeen' to show you.",

  // Optional longer pain context (rarely used — most pages don't need it).
  "pain_points_extended": null
}
```

### Grounding quirks to respect

1. **Any field may be `null` or missing.** Render nothing if missing — don't show "TBD" placeholders.
2. **Pass leads**: when Claude Desktop detects the business already has a modern site, `hook` starts with `"PASS — …"` and pain_points/opener/close_script will be `null`. The UI should recognise this and show a distinct "Skip this lead" state.
3. **British English**, no em-dashes, no exclamation marks. Don't post-process the strings.
4. **Arrays of objection pairs** are shaped `{ objection: string; response: string }[]`. Empty array if none.

---

## Mobile API side

### Response shape change

Whatever endpoint returns a lead detail (likely `GET /leads/:id` on the
mobile-api at port 4350), extend the serialiser to include the seven new
fields on top of whatever it already returns. Pull them off the JSON in
`lead_assignments.notes`:

```ts
// Server-side, when hydrating a lead detail:
const n = JSON.parse(row.notes ?? '{}');

return {
  // ...existing fields
  hook: n.hook ?? null,
  opener: n.opener ?? null,
  demo_moments: Array.isArray(n.demo_moments) ? n.demo_moments : [],
  specific_objections: Array.isArray(n.specific_objections)
    ? n.specific_objections.filter((x: any) => x?.objection)
    : [],
  close_script: n.close_script ?? null,
  next_visit_reason: n.next_visit_reason ?? null,
  pain_points_extended: n.pain_points_extended ?? null,
};
```

If your mobile-api also returns a lead LIST endpoint, you probably only
need `hook` in the list response (for a compact "why this lead" preview
line); keep the full brief for the detail endpoint.

---

## iOS side

### Swift model additions

Wherever `LeadDetail` (or equivalent) is defined, add:

```swift
struct ObjectionPair: Codable, Hashable {
    let objection: String
    let response: String
}

// Add to the LeadDetail struct:
let hook: String?
let opener: String?
let demoMoments: [String]
let specificObjections: [ObjectionPair]
let closeScript: String?
let nextVisitReason: String?
let painPointsExtended: String?
```

If you're using snake_case-to-camelCase conversion via a
`JSONDecoder().keyDecodingStrategy = .convertFromSnakeCase`, these will
decode automatically. If you use explicit `CodingKeys`, add:

```swift
enum CodingKeys: String, CodingKey {
    // ...existing
    case hook
    case opener
    case demoMoments = "demo_moments"
    case specificObjections = "specific_objections"
    case closeScript = "close_script"
    case nextVisitReason = "next_visit_reason"
    case painPointsExtended = "pain_points_extended"
}
```

### UI layout — match the web lead-detail order

The web already renders these sections in this exact order. **Match the
information hierarchy on iOS** — don't reinvent it. The order is
deliberately tuned for the closer's flow.

1. **Hero** (business name, status, rating) — unchanged
2. **The hook** — gold-bordered card, display font, largest sales-brief
   text on the page. If `hook` is non-null, render immediately after the hero.
3. **The brief** (description) — existing card, if present.
4. **Opener** — quote card, signal-left-border. Label: "First line at
   the door". Italic or quoted display text.
5. **Pain points** — existing numbered cards. Heading: "What's costing
   them money".
6. **Demo moments** — arrow-prefixed cards (→). Heading: "What to tap
   during the demo". Render only if array has items.
7. **Demo site preview** — existing (browser chrome + brand-coloured
   hero). Unchanged.
8. **Services** — existing chip row.
9. **Best reviews** — existing quote cards.
10. **Specific objections** — paired cards: "They say" (amber label +
    quote) then "You say" (signal label + response). Render only if
    non-empty.
11. **The close** — gold-tinted card. Heading: "Ask for the sale".
    Display font, quoted. Render `close_script`.
12. **If today's a no** — subtle card with `next_visit_reason`.
13. **Don't mention** — existing avoid-topics list.
14. **Right rail / bottom on iPhone**: contact, hours, timeline,
    follow-up — unchanged.

### Styling (match the web design system)

From `HANDOVER_IOS_PORT.md` (also at repo root):

- Hook card: `Brand.signal.opacity(0.12)` background,
  `Brand.signal.opacity(0.4)` border, `Brand.signal` eyebrow.
- Opener card: `Brand.bgStrong`, signal 3pt left border, display font.
- Demo moment cards: `Brand.bgStrong`, signal arrow, cream body.
- Objection cards: `Brand.bgStrong`. "They say" label uses
  `rgb(220, 150, 80)` (amber). "You say" label uses `Brand.signal`.
- Close card: `Brand.signal.opacity(0.1)` background,
  `Brand.signal.opacity(0.35)` border. Display font, italic-quote style.
- Next-visit card: `Brand.bgStrong`, muted body.

All eyebrows: JetBrains Mono / SF Mono, 10pt, `letterSpacing 0.14em`,
uppercase, prefixed with `/ `.

---

## Testing

1. Log in as the demo account on the iOS app (PIN `0000`, name `Demo
   Account`), and claim the seeded leads. The demo seed in
   `/api/auth/demo` on the sales-dashboard inserts Mario's Deli, Rosa's
   Barbers, etc. into Supabase — these currently **don't** have the new
   fields.

2. To get a lead WITH the new fields into your test database, use the
   admin portal:
   - Visit `https://salesflow-sigma.vercel.app/admin`
   - Password: `salesflow2026`
   - Go to Leads → fill in the form (use the "Sales brief" section
     inputs I added) → or drop a JSON brief that includes `hook`,
     `opener`, `demo_moments`, etc.
   - Assign to a test user.
   - Then fetch that lead on the iOS app.

3. Minimum valid test payload (paste into the drop zone as
   `test-lead.json`):

```json
{
  "user_id": "REPLACE_WITH_A_REAL_SALES_USER_UUID",
  "business_name": "Fable Books",
  "business_type": "Speciality coffee & bookshop",
  "postcode": "AB10",
  "google_rating": 5.0,
  "google_review_count": 60,
  "contact_name": "Amy",
  "contact_role": "Owner",
  "demo_site_domain": "fable-aberdeen.shop",
  "hook": "Amy's book clubs sell out via DM — she turns people away every month.",
  "opener": "Hi, is Amy in? I'm Kevin. I noticed Fable's got 5.0 from 60 reviews.",
  "pain_points": [
    "Book-club bookings go through DMs and get lost",
    "No online gift-card sales during commute hours"
  ],
  "demo_moments": [
    "Tap Events — show the book-club booking flow.",
    "Scroll to hours — Sunday is wrong on Google.",
    "Tap Buy Gift Cards — live payment, no middleman."
  ],
  "specific_objections": [
    {
      "objection": "Instagram works fine for me",
      "response": "Fair. But how many DMs did you miss this weekend? A site takes bookings while you sleep."
    },
    {
      "objection": "I don't need another system to learn",
      "response": "You won't. Bookings hit your phone the same way DMs do — we just take the filtering out."
    }
  ],
  "close_script": "It's £350 and live by Friday. I can take a card number now or come back Thursday — which works?",
  "next_visit_reason": "Can I drop back Thursday with the live search-ranking numbers for 'bookshop Aberdeen'?",
  "services": ["Speciality coffee", "New books", "Monthly book club", "Author events"],
  "trust_badges": ["Independent since 2019"],
  "best_reviews": [
    { "author": "Hannah M.", "rating": 5, "text": "Best coffee and curation in town. Amy's recommendations never miss." }
  ],
  "avoid_topics": []
}
```

---

## Where the source of truth lives

- **TypeScript type**: `apps/sales-dashboard/src/lib/types.ts` →
  `LeadDetail` + `ObjectionPair`.
- **Admin form that produces the data**:
  `apps/sales-dashboard/src/app/admin/leads/page.tsx`.
- **Lead write endpoint**:
  `apps/sales-dashboard/src/app/api/admin/leads/route.ts` (POST).
- **Lead read endpoint (used by web dashboard)**:
  `apps/sales-dashboard/src/app/api/leads/[id]/route.ts` (GET).
- **Web rendering** (copy the section order + styling from here):
  `apps/sales-dashboard/src/app/lead/[id]/page.tsx`.
- **Claude Desktop prompt** (live in the admin UI, copy-button):
  scroll to `HANDOFF_PROMPT` in `apps/sales-dashboard/src/app/admin/leads/page.tsx`.

---

## Non-goals for this task

- Don't change the admin UI. It's done.
- Don't change the sales-dashboard web lead page. It's done.
- Don't modify the demo site HTML upload flow.
- Don't touch auth, payouts, referrals, or profile.

Just: mobile-api serialiser + iOS lead view render.

---

## When done

The iOS contractor should open a lead from the admin portal and see, in
order: the hook, the opener quote, pain points, demo moments, demo
preview, objection pairs, the close, the next-visit line — laid out
with the same brand typography, signal-gold accents, warm-ink cards.
The brief should feel like a field playbook, not a data dump.
