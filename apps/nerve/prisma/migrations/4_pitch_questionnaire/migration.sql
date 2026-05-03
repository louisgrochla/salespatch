-- Extend PitchLog with the post-pitch questionnaire fields. Additive only;
-- the existing 'closed' / 'rejected' / 'follow_up' enum values are kept
-- so any legacy ingest still validates. New richer outcomes give the
-- iOS questionnaire the granularity it needs.

-- AlterEnum (Postgres requires per-value ALTER TYPE)
ALTER TYPE "PitchOutcome" ADD VALUE IF NOT EXISTS 'closed_now';
ALTER TYPE "PitchOutcome" ADD VALUE IF NOT EXISTS 'closed_followup';
ALTER TYPE "PitchOutcome" ADD VALUE IF NOT EXISTS 'not_pitched';

-- CreateEnum
CREATE TYPE "InterestLevel" AS ENUM ('cold', 'warm', 'hot');

-- CreateEnum
CREATE TYPE "DemoReaction" AS ENUM ('loved', 'liked', 'neutral', 'unimpressed');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('paid_now', 'will_pay_followup');

-- CreateEnum
CREATE TYPE "FollowupTime" AS ENUM ('tomorrow', 'this_week', 'next_week', 'next_month');

-- CreateEnum
CREATE TYPE "AgreedNextStep" AS ENUM ('sp_will_call', 'customer_will_call', 'sent_link', 'scheduled_meeting');

-- CreateEnum
CREATE TYPE "PitchQualityFlag" AS ENUM ('ok', 'excluded');

-- AlterTable
ALTER TABLE "PitchLog"
  ADD COLUMN "pitchAttemptNumber"   INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "decisionMakerPresent" BOOLEAN,
  ADD COLUMN "demoShown"             BOOLEAN,
  ADD COLUMN "interestLevel"         "InterestLevel",
  ADD COLUMN "consentToRecord"       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "demoReaction"          "DemoReaction",
  ADD COLUMN "agreedPrice"           DECIMAL(10, 2),
  ADD COLUMN "paymentMethod"         "PaymentMethod",
  ADD COLUMN "bestFollowupTime"      "FollowupTime",
  ADD COLUMN "agreedNextStep"        "AgreedNextStep",
  ADD COLUMN "gutFeelClosePct"       INTEGER,
  ADD COLUMN "firstResponsePhrase"   TEXT,
  ADD COLUMN "competitorMentioned"   TEXT,
  ADD COLUMN "gpsLat"                DOUBLE PRECISION,
  ADD COLUMN "gpsLng"                DOUBLE PRECISION,
  ADD COLUMN "qualityFlag"           "PitchQualityFlag" NOT NULL DEFAULT 'ok';

-- CreateIndex
CREATE INDEX "PitchLog_qualityFlag_idx" ON "PitchLog"("qualityFlag");

-- CreateIndex
CREATE INDEX "PitchLog_decisionMakerPresent_idx" ON "PitchLog"("decisionMakerPresent");

-- CreateIndex
CREATE INDEX "PitchLog_interestLevel_idx" ON "PitchLog"("interestLevel");
