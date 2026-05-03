-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "PitchOutcome" AS ENUM ('closed', 'rejected', 'follow_up');

-- CreateEnum
CREATE TYPE "OperationsLogType" AS ENUM ('weekly', 'decision', 'failure', 'iteration');

-- CreateEnum
CREATE TYPE "CostCategory" AS ENUM ('infrastructure', 'compute', 'tools', 'misc');

-- CreateEnum
CREATE TYPE "ContactedStatus" AS ENUM ('not_contacted', 'contacted', 'pitched', 'closed', 'rejected');

-- CreateEnum
CREATE TYPE "DissertationStatus" AS ENUM ('not_started', 'draft', 'in_progress', 'complete');

-- CreateEnum
CREATE TYPE "LiteraturePosition" AS ENUM ('supports', 'challenges', 'contextualises');

-- CreateEnum
CREATE TYPE "IngestStatus" AS ENUM ('ok', 'failed');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhaseBoundary" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "operationalDescription" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhaseBoundary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PitchLog" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "businessName" TEXT NOT NULL,
    "businessType" TEXT,
    "sector" TEXT,
    "location" TEXT,
    "leadSource" TEXT,
    "demoVersion" TEXT,
    "outcome" "PitchOutcome" NOT NULL,
    "contractorId" TEXT,
    "pitchDuration" INTEGER,
    "consentFlag" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "supabasePitchId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "phaseLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PitchLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObjectionTag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ObjectionTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PitchObjection" (
    "pitchId" TEXT NOT NULL,
    "objectionId" TEXT NOT NULL,

    CONSTRAINT "PitchObjection_pkey" PRIMARY KEY ("pitchId","objectionId")
);

-- CreateTable
CREATE TABLE "OperationsLog" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" "OperationsLogType" NOT NULL,
    "body" TEXT,
    "decision" TEXT,
    "reasoning" TEXT,
    "outcome" TEXT,
    "whatFailed" TEXT,
    "why" TEXT,
    "whatChanged" TEXT,
    "beforeState" TEXT,
    "afterState" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "phaseLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationsLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevenueEntry" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "dealReference" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "phaseLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RevenueEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostEntry" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "category" "CostCategory" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "phaseLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArchitectureDocument" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "phaseLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArchitectureDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemChangelog" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "version" TEXT NOT NULL,
    "whatChanged" TEXT NOT NULL,
    "why" TEXT,
    "phaseLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemChangelog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptLibraryEntry" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fullText" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL DEFAULT 1,
    "performanceNotes" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "phaseLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromptLibraryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptVersion" (
    "id" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "fullText" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "performanceNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromptVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfrastructureNote" (
    "id" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "configNotes" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "phaseLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InfrastructureNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineDoc" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "performanceNotes" TEXT,
    "phaseLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineDoc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelDoc" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "trainingDetails" TEXT,
    "costPerCycle" DECIMAL(10,4),
    "phaseLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelDoc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemoRecord" (
    "id" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "sector" TEXT,
    "url" TEXT,
    "fileReference" TEXT,
    "dateBuilt" TIMESTAMP(3) NOT NULL,
    "templateVersion" TEXT,
    "conversionOutcome" TEXT,
    "notes" TEXT,
    "phaseLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemoRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadRecord" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "sector" TEXT,
    "location" TEXT,
    "contactedStatus" "ContactedStatus" NOT NULL DEFAULT 'not_contacted',
    "sourceMethod" TEXT,
    "doNotContact" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "phaseLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DissertationMeta" (
    "id" TEXT NOT NULL DEFAULT 'main',
    "workingTitle" TEXT NOT NULL,
    "researchQuestion" TEXT NOT NULL,
    "supervisor" TEXT,
    "submissionDeadline" TIMESTAMP(3),
    "overallStatus" "DissertationStatus" NOT NULL DEFAULT 'in_progress',
    "phaseLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DissertationMeta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkingTitleVersion" (
    "id" TEXT NOT NULL,
    "dissertationId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkingTitleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchQuestionVersion" (
    "id" TEXT NOT NULL,
    "dissertationId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchQuestionVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiteratureEntry" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "authors" TEXT NOT NULL,
    "year" INTEGER,
    "url" TEXT,
    "doi" TEXT,
    "abstract" TEXT,
    "themeTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "personalNotes" TEXT,
    "position" "LiteraturePosition",
    "phaseLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiteratureEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DissertationSection" (
    "id" TEXT NOT NULL,
    "chapter" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "status" "DissertationStatus" NOT NULL DEFAULT 'not_started',
    "wordCountTarget" INTEGER,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "supervisorFeedback" TEXT,
    "phaseLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DissertationSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DissertationSectionVersion" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "wordCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DissertationSectionVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DissertationSectionLiterature" (
    "sectionId" TEXT NOT NULL,
    "literatureId" TEXT NOT NULL,

    CONSTRAINT "DissertationSectionLiterature_pkey" PRIMARY KEY ("sectionId","literatureId")
);

-- CreateTable
CREATE TABLE "MethodologyDoc" (
    "id" TEXT NOT NULL,
    "phaseName" TEXT NOT NULL,
    "formalDescription" TEXT NOT NULL,
    "mixedMethodsJustification" TEXT,
    "sampleSizeNotes" TEXT,
    "statisticalApproach" TEXT,
    "gdprHandling" TEXT,
    "nerveAsInfrastructure" TEXT,
    "phaseLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MethodologyDoc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceLog" (
    "id" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "dissertationSectionId" TEXT,
    "annotation" TEXT NOT NULL,
    "phaseLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvidenceLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupervisorMeeting" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "feedback" TEXT,
    "agreedActions" TEXT,
    "followUpStatus" TEXT,
    "phaseLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupervisorMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicCalendarItem" (
    "id" TEXT NOT NULL,
    "milestone" TEXT NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "dissertationSectionId" TEXT,
    "phaseLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademicCalendarItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandDocument" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "phaseLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessGuide" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "steps" TEXT NOT NULL,
    "lastUpdated" TIMESTAMP(3) NOT NULL,
    "phaseLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessGuide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlossaryEntry" (
    "id" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "definition" TEXT NOT NULL,
    "context" TEXT,
    "phaseLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlossaryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalResource" (
    "id" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "notes" TEXT,
    "phaseLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalDocument" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "content" TEXT,
    "fileReference" TEXT,
    "phaseLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GdprRecord" (
    "id" TEXT NOT NULL,
    "dataType" TEXT NOT NULL,
    "collectionMethod" TEXT NOT NULL,
    "retentionPeriod" TEXT NOT NULL,
    "legalBasis" TEXT NOT NULL,
    "phaseLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GdprRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractorAgreementVersion" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "phaseLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractorAgreementVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompaniesHouseRecord" (
    "id" TEXT NOT NULL,
    "filingType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "phaseLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompaniesHouseRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IpDocument" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "phaseLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IpDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookIngestion" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "status" "IngestStatus" NOT NULL,
    "errorMessage" TEXT,
    "payloadHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookIngestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Embedding" (
    "id" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "chunkText" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL,
    "embedding" vector(1536),
    "phaseLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Embedding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PhaseBoundary_name_key" ON "PhaseBoundary"("name");

-- CreateIndex
CREATE INDEX "PhaseBoundary_startDate_idx" ON "PhaseBoundary"("startDate");

-- CreateIndex
CREATE UNIQUE INDEX "PitchLog_supabasePitchId_key" ON "PitchLog"("supabasePitchId");

-- CreateIndex
CREATE INDEX "PitchLog_date_idx" ON "PitchLog"("date");

-- CreateIndex
CREATE INDEX "PitchLog_phaseLabel_idx" ON "PitchLog"("phaseLabel");

-- CreateIndex
CREATE INDEX "PitchLog_sector_idx" ON "PitchLog"("sector");

-- CreateIndex
CREATE INDEX "PitchLog_outcome_idx" ON "PitchLog"("outcome");

-- CreateIndex
CREATE INDEX "PitchLog_businessType_idx" ON "PitchLog"("businessType");

-- CreateIndex
CREATE INDEX "PitchLog_contractorId_idx" ON "PitchLog"("contractorId");

-- CreateIndex
CREATE INDEX "PitchLog_leadSource_idx" ON "PitchLog"("leadSource");

-- CreateIndex
CREATE INDEX "PitchLog_demoVersion_idx" ON "PitchLog"("demoVersion");

-- CreateIndex
CREATE UNIQUE INDEX "ObjectionTag_name_key" ON "ObjectionTag"("name");

-- CreateIndex
CREATE INDEX "PitchObjection_objectionId_idx" ON "PitchObjection"("objectionId");

-- CreateIndex
CREATE INDEX "OperationsLog_date_idx" ON "OperationsLog"("date");

-- CreateIndex
CREATE INDEX "OperationsLog_type_idx" ON "OperationsLog"("type");

-- CreateIndex
CREATE INDEX "OperationsLog_phaseLabel_idx" ON "OperationsLog"("phaseLabel");

-- CreateIndex
CREATE INDEX "RevenueEntry_date_idx" ON "RevenueEntry"("date");

-- CreateIndex
CREATE INDEX "RevenueEntry_phaseLabel_idx" ON "RevenueEntry"("phaseLabel");

-- CreateIndex
CREATE INDEX "CostEntry_date_idx" ON "CostEntry"("date");

-- CreateIndex
CREATE INDEX "CostEntry_phaseLabel_idx" ON "CostEntry"("phaseLabel");

-- CreateIndex
CREATE INDEX "CostEntry_category_idx" ON "CostEntry"("category");

-- CreateIndex
CREATE INDEX "SystemChangelog_date_idx" ON "SystemChangelog"("date");

-- CreateIndex
CREATE UNIQUE INDEX "PromptLibraryEntry_name_key" ON "PromptLibraryEntry"("name");

-- CreateIndex
CREATE INDEX "PromptVersion_promptId_idx" ON "PromptVersion"("promptId");

-- CreateIndex
CREATE UNIQUE INDEX "PromptVersion_promptId_versionNumber_key" ON "PromptVersion"("promptId", "versionNumber");

-- CreateIndex
CREATE INDEX "DemoRecord_dateBuilt_idx" ON "DemoRecord"("dateBuilt");

-- CreateIndex
CREATE INDEX "DemoRecord_templateVersion_idx" ON "DemoRecord"("templateVersion");

-- CreateIndex
CREATE INDEX "LeadRecord_sourceMethod_idx" ON "LeadRecord"("sourceMethod");

-- CreateIndex
CREATE INDEX "LeadRecord_contactedStatus_idx" ON "LeadRecord"("contactedStatus");

-- CreateIndex
CREATE INDEX "LeadRecord_sector_idx" ON "LeadRecord"("sector");

-- CreateIndex
CREATE INDEX "WorkingTitleVersion_dissertationId_idx" ON "WorkingTitleVersion"("dissertationId");

-- CreateIndex
CREATE INDEX "ResearchQuestionVersion_dissertationId_idx" ON "ResearchQuestionVersion"("dissertationId");

-- CreateIndex
CREATE INDEX "LiteratureEntry_year_idx" ON "LiteratureEntry"("year");

-- CreateIndex
CREATE INDEX "LiteratureEntry_themeTags_idx" ON "LiteratureEntry" USING GIN ("themeTags");

-- CreateIndex
CREATE UNIQUE INDEX "DissertationSection_chapter_key" ON "DissertationSection"("chapter");

-- CreateIndex
CREATE INDEX "DissertationSectionVersion_sectionId_idx" ON "DissertationSectionVersion"("sectionId");

-- CreateIndex
CREATE INDEX "DissertationSectionLiterature_literatureId_idx" ON "DissertationSectionLiterature"("literatureId");

-- CreateIndex
CREATE UNIQUE INDEX "MethodologyDoc_phaseName_key" ON "MethodologyDoc"("phaseName");

-- CreateIndex
CREATE INDEX "EvidenceLog_sourceType_sourceId_idx" ON "EvidenceLog"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "EvidenceLog_dissertationSectionId_idx" ON "EvidenceLog"("dissertationSectionId");

-- CreateIndex
CREATE INDEX "SupervisorMeeting_date_idx" ON "SupervisorMeeting"("date");

-- CreateIndex
CREATE INDEX "AcademicCalendarItem_deadline_idx" ON "AcademicCalendarItem"("deadline");

-- CreateIndex
CREATE UNIQUE INDEX "GlossaryEntry_term_key" ON "GlossaryEntry"("term");

-- CreateIndex
CREATE UNIQUE INDEX "ContractorAgreementVersion_version_key" ON "ContractorAgreementVersion"("version");

-- CreateIndex
CREATE INDEX "WebhookIngestion_createdAt_idx" ON "WebhookIngestion"("createdAt");

-- CreateIndex
CREATE INDEX "WebhookIngestion_status_idx" ON "WebhookIngestion"("status");

-- CreateIndex
CREATE INDEX "Embedding_sourceType_sourceId_idx" ON "Embedding"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "Embedding_phaseLabel_idx" ON "Embedding"("phaseLabel");

-- CreateIndex
CREATE INDEX "Embedding_sourceType_idx" ON "Embedding"("sourceType");

-- AddForeignKey
ALTER TABLE "PitchObjection" ADD CONSTRAINT "PitchObjection_pitchId_fkey" FOREIGN KEY ("pitchId") REFERENCES "PitchLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PitchObjection" ADD CONSTRAINT "PitchObjection_objectionId_fkey" FOREIGN KEY ("objectionId") REFERENCES "ObjectionTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptVersion" ADD CONSTRAINT "PromptVersion_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "PromptLibraryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkingTitleVersion" ADD CONSTRAINT "WorkingTitleVersion_dissertationId_fkey" FOREIGN KEY ("dissertationId") REFERENCES "DissertationMeta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchQuestionVersion" ADD CONSTRAINT "ResearchQuestionVersion_dissertationId_fkey" FOREIGN KEY ("dissertationId") REFERENCES "DissertationMeta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DissertationSectionVersion" ADD CONSTRAINT "DissertationSectionVersion_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "DissertationSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DissertationSectionLiterature" ADD CONSTRAINT "DissertationSectionLiterature_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "DissertationSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DissertationSectionLiterature" ADD CONSTRAINT "DissertationSectionLiterature_literatureId_fkey" FOREIGN KEY ("literatureId") REFERENCES "LiteratureEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceLog" ADD CONSTRAINT "EvidenceLog_dissertationSectionId_fkey" FOREIGN KEY ("dissertationSectionId") REFERENCES "DissertationSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicCalendarItem" ADD CONSTRAINT "AcademicCalendarItem_dissertationSectionId_fkey" FOREIGN KEY ("dissertationSectionId") REFERENCES "DissertationSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

