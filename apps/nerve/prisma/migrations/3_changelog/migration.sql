-- CreateEnum
CREATE TYPE "ChangelogProjectType" AS ENUM ('nerve', 'salespatch', 'ios_app', 'sl_mas_pipeline', 'spit_out', 'other');

-- CreateTable
CREATE TABLE "ChangelogEntry" (
    "id" TEXT NOT NULL,
    "project" TEXT NOT NULL,
    "sessionSummary" TEXT NOT NULL,
    "whatChanged" TEXT NOT NULL,
    "why" TEXT NOT NULL,
    "decisionsMade" TEXT NOT NULL,
    "problemsEncountered" TEXT NOT NULL,
    "currentState" TEXT NOT NULL,
    "whatsNext" TEXT NOT NULL,
    "filesModified" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sessionDate" TIMESTAMP(3) NOT NULL,
    "sessionDurationMinutes" INTEGER,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "retrospectiveNote" TEXT,
    "projectType" "ChangelogProjectType" NOT NULL,
    "phaseLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChangelogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChangelogEntry_sessionDate_idx" ON "ChangelogEntry"("sessionDate");

-- CreateIndex
CREATE INDEX "ChangelogEntry_project_idx" ON "ChangelogEntry"("project");

-- CreateIndex
CREATE INDEX "ChangelogEntry_projectType_idx" ON "ChangelogEntry"("projectType");

-- CreateIndex
CREATE INDEX "ChangelogEntry_phaseLabel_idx" ON "ChangelogEntry"("phaseLabel");

-- CreateIndex
CREATE INDEX "ChangelogEntry_tags_idx" ON "ChangelogEntry" USING GIN ("tags");
