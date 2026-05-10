-- Site QA results.
--
-- A5 of Phase A. Captures per-artefact QA scores from the Pi
-- `siteQaAgent` (autumn) or any manual QA pass — HTML validity,
-- accessibility, colour contrast, plus an overall pass/fail and a
-- numeric score that the analytics layer can correlate against
-- pitch outcomes ("do high-QA demos close better?").
--
-- One row per QA run. Soft FK to demo_artefacts.artefact_id so a single
-- artefact can accumulate multiple QA passes over time (eg the agent
-- re-runs after the founder edits the demo). The (artefactId, ranAt
-- DESC) index makes "latest QA for this artefact" a one-row lookup;
-- history is preserved for trend analysis.
--
-- Caller-supplied qaId for replay safety. Conventional format:
-- `<artefact_id>-qa-<iso_no_colons>`.
--
-- Score lives on a 0-100 scale. `passed` is a derived boolean the agent
-- decides; the convention is score >= 70 = pass, but the agent owns the
-- rule, the table just records the verdict.

CREATE TABLE "qa_results" (
    "id"                  TEXT             NOT NULL,
    "qa_id"               TEXT             NOT NULL, -- caller-supplied natural key
    "artefact_id"         TEXT             NOT NULL, -- soft FK to demo_artefacts.artefact_id
    "lead_id"             TEXT             NOT NULL, -- denormalised so QA queries don't have to join
    "score"               INTEGER          NOT NULL, -- 0-100 overall
    "passed"              BOOLEAN          NOT NULL, -- agent-decided pass/fail (typically score >= 70)
    "html_valid"          BOOLEAN, -- did the HTML parse cleanly?
    "html_warnings"       INTEGER          NOT NULL DEFAULT 0,
    "html_errors"         INTEGER          NOT NULL DEFAULT 0,
    "accessibility_score" INTEGER, -- 0-100
    "contrast_score"      INTEGER, -- 0-100, WCAG contrast compliance
    "performance_score"   INTEGER, -- 0-100, page weight + render hints
    "issues"              JSONB            NOT NULL DEFAULT '[]'::jsonb, -- [{ severity, area, message, line }]
    "notes"               TEXT, -- free-form qualitative summary from the agent
    "agent_id"            TEXT, -- which agent / manual reviewer produced this
    "agent_version"       TEXT, -- prompt version, model id, ruleset hash
    "source"              TEXT             NOT NULL DEFAULT 'manual_skill', -- "manual_skill" | "pi_qa_agent"
    "metadata"            JSONB            NOT NULL DEFAULT '{}'::jsonb,
    "ran_at"              TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at"          TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"          TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "qa_results_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "qa_results_qa_id_key"                  ON "qa_results" ("qa_id");
CREATE INDEX        "qa_results_artefact_id_ran_at_idx"     ON "qa_results" ("artefact_id", "ran_at" DESC);
CREATE INDEX        "qa_results_lead_id_ran_at_idx"         ON "qa_results" ("lead_id", "ran_at" DESC);
CREATE INDEX        "qa_results_passed_score_idx"           ON "qa_results" ("passed", "score" DESC);
