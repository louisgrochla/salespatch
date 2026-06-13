# salespatch

> A multi-agent AI platform that helps UK independent local businesses get a website they'd actually want, sold to them by humans who don't need to do the design work.

**Status:** Closed beta · live since May 2026 in Aberdeen
**Stack:** TypeScript · Next.js 14 · Node.js · SQLite + Supabase Postgres · Stripe Connect · Swift (iOS) · React Native (Expo) · Claude API · OpenRouter · Apify · Playwright

---

## What it does

Most independent UK businesses (cafés, salons, butchers, florists) either have no website or have a Wix page they made in 2017. Building them a good one is a slow, design-heavy job. Salespatch flips the order of operations:

1. A pipeline of LLM agents researches a business (Google, Instagram, Maps, their own site)
2. The agents extract a **brand signature** — colour, tone, audience, what their existing assets actually say
3. A separate generation pass produces a **personalised single-file HTML demo site** specifically for that business — not a template
4. A salesperson then walks into the shop with a pitch deck and a live demo already built. The demo *is* the pitch.
5. If the business signs, the demo is deployed on a real domain through the platform.

The thesis: the friction in selling websites to local SMBs isn't sales talent, it's the cost of building a bespoke demo for every prospect. Bring that cost to near-zero with AI and the whole funnel changes.

---

## Architecture

```
              ┌─────────────────────────────────────────────────────┐
              │   Agent Orchestration Runtime (TypeScript · SQLite) │
              │                                                     │
              │   Lead pipeline   scout → profile → brand-analyse → │
              │                   brand-intelligence → qualify →    │
              │                   assign                            │
              │                                                     │
              │   Site pipeline   brief → compose → QA              │
              │                                                     │
              │   9 agents total across two pipelines               │
              └────────────────┬────────────────────────────────────┘
                                           │
       ┌───────────────────────────────────┼──────────────────────────────┐
       │                                   │                              │
┌──────▼───────┐                  ┌────────▼─────────┐           ┌────────▼────────┐
│ mission-     │                  │ sales-dashboard  │           │ admin-panel     │
│ control      │                  │ (Vercel)         │           │ (back office)   │
│ (self-hosted)│                 │ Next.js +        │           │ Next.js +       │
│  Next.js     │                  │ Supabase +       │           │ SQLite          │
│              │                  │ Stripe Connect   │           │                 │
└──────────────┘                  └──────────────────┘           └─────────────────┘
                                           │
                                  ┌────────▼─────────┐
                                  │ mobile-api       │
                                  │ Express + SQLite │
                                  └────────┬─────────┘
                                           │
                                  ┌────────▼─────────┐
                                  │ iOS (SwiftUI)    │
                                  │ + Expo (RN)      │
                                  └──────────────────┘
```

The agent runtime is transport-agnostic — it can run as a local CLI, as an operator web service, or behind an external orchestration layer. The split between SQLite (operator-side) and Supabase Postgres (salesperson-side, on the web) is deliberate: the operator system stays self-contained and self-hosted, while the public-facing surfaces are cloud-deployed and horizontally scaled.

---

## Apps in this monorepo

| Path | Stack | Role |
|---|---|---|
| `src/` | TypeScript, SQLite | Agent orchestration runtime — the brain |
| `apps/mission-control/` | Next.js 14 | Operator dashboard (self-hosted) |
| `apps/sales-dashboard/` | Next.js 14, Supabase, Stripe Connect | Public salesperson dashboard (Vercel) |
| `apps/admin-panel/` | Next.js 14 | Back-office admin UI |
| `apps/nerve/` | Next.js 14, Prisma | Session changelog + decision log |
| `apps/mobile-api/` | Express, SQLite | Backend API for mobile clients |
| `apps/mobile/` | Expo / React Native | Cross-platform salesperson app |
| `apps/ios/SalesFlow/` | SwiftUI | Native iOS app for salespeople in the field |
| `tools/workbench/` | tsx + static frontend | Local UI for iterating on demo site generation quality |

---

## The interesting bits (for ML / agent-eng folks)

- **LLM evaluation pipeline** — golden-set evals on agent outputs, prompt versioning, regression tests when prompts change. The `site-qa` agent grades demo outputs against a rubric before they ever hit a salesperson, and a separate visual-QA pipeline catches hardcoded content and CTA-hierarchy bugs that pure-text evals miss.
- **Multi-stage brand extraction** — instead of one giant prompt, a chain of focused agents each producing structured JSON, then composed. Failures are localised and rerunnable.
- **Voice budgeting & specificity layers** — generated copy is checked against the brand voice extracted upstream; vague filler is flagged and regenerated.
- **NERVE — the data flywheel** ([live: nerve.salespatch.co.uk](https://nerve.salespatch.co.uk)). Every pitch outcome, demo performance metric, and lead-funnel event flows through an authenticated, idempotent ingestion layer into a Postgres warehouse purpose-built as the training-data substrate for the next architectural milestone: replacing LLM-agent stages with smaller fine-tuned critic models once enough labelled outcomes accumulate. An anonymised public view of platform performance ships at the URL above, and is the primary dataset for my 4th-year university dissertation on the self-learning system. The system is designed to collect its own training data as a byproduct of operating.
- **Production constraints baked into prompts** — agents output single-file HTML demos that must lint clean, score ≥90 on Lighthouse mobile, and pass accessibility checks before they're surfaced.

---

## Roadmap (public)

- **February 2026** — Project started.
- **May 2026** — Closed beta launched in Aberdeen with 5 salespeople in the field. 40+ sellable demos generated for real businesses; another 200+ test demos held back as the training corpus for the future critic-LoRA phase. First real lead validated end-to-end through the full pipeline (research → demo → admin queue → field) on 2026-05-11.
- **Summer 2026** — Scale beta to ~50 leads; tighten the NERVE ingestion layer; ship the salesperson-facing iOS app to TestFlight.
- **Autumn 2026** — Honours dissertation begins; pitched as an applied ML / NLP study using salespatch's outcome data as the source.
- **Q4 2026 / 2027** — Once enough closed/rejected outcomes accumulate, train the first critic-LoRA on a real outcome dataset and swap it into the agent pipeline. This is when "multi-agent system using LLMs" becomes "self-learning multi-agent system."

---

## Why is this on GitHub publicly?

I'm a final-year university student building this in the open. The agent orchestration patterns, the eval harnesses, and the multi-app architecture are the bits I'm proudest of and the bits I think other people building LLM-powered tools could learn from. Business strategy and customer-specific work is kept private; the technical machinery is open.

---

## Contact

Louis Grochla — [LinkedIn](https://www.linkedin.com/in/louisgrochla/) · louisgrochla27@gmail.com

Final-year BA (Hons) Digital Marketing & Business Analytics, Robert Gordon University, Aberdeen. Applying to MS Data Science programs in the US for 2027.

---

## Development

If you want to actually run this locally (you probably don't — it's wired to a specific deployment), see [`DEVELOPMENT.md`](./DEVELOPMENT.md) for runtime modes, env vars, and the OpenClaw integration spec.
