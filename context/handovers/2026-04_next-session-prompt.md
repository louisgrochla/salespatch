# Next Session Prompt

Copy everything below this line and paste it as your first message:

---

Read `HANDOVER.md` in full before doing anything. It contains the complete state of the project — every bug, every agent, every API key, what's dead code, and what needs building.

Then enter plan mode. We need to plan the next phase of work. Here's what I want, in priority order:

**1. Composer Workbench (TOP PRIORITY)**
I need a local web UI where I can iterate on demo site quality without running the full pipeline. Requirements:
- Pick any lead from the SQLite database (show their name, type, photos, IG data)
- Adjust composer settings (prompt tweaks, temperature, model, which photos to include)
- Hit "Generate" and see the result in ~30 seconds
- Preview the HTML inline, side-by-side with the business's real website/photos
- Save good outputs, discard bad ones
- No pipeline needed — just brief → compose, using data already in the DB

**2. Fix the Qualifier**
The qualifier lets through chains (Black Sheep Coffee, Cake Box) and businesses that already have decent websites. I need hard rejection rules:
- Instagram followers > 10K = reject (chain signal)
- Known chain database + multi-location detection
- Existing website quality score > 70 = reject (they don't need us)
- Must have physical premises
- Expand verticals beyond cafes/barbers — add trades, health, automotive, retail, services

**3. Simplify the Pipeline**
The current pipeline engine with scheduler, node status, retry mechanism is over-engineered and broke multiple times. Replace with a single `run-pipeline.ts` script that runs agents in sequence with plain async/await. No state machines, no scheduler, no DAG resolution.

**4. Clean Up Dead Code**
Remove everything listed in HANDOVER.md §6 (content automation, social media, telephony, learning system, ClawDeck compat, etc.)

Don't start coding yet. Plan first — tell me what you'd build, how long each piece is, what the architecture looks like, and what order to tackle it. Use a worktree.
