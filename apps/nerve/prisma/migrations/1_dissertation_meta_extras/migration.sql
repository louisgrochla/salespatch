-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- AlterTable
ALTER TABLE "DissertationMeta" ADD COLUMN     "academicFraming" TEXT,
ADD COLUMN     "degree" TEXT,
ADD COLUMN     "degreeRelevanceAnalytics" TEXT,
ADD COLUMN     "degreeRelevanceMarketing" TEXT,
ADD COLUMN     "institution" TEXT,
ADD COLUMN     "submissionDeadlineNote" TEXT,
ADD COLUMN     "wordCountTargetMax" INTEGER,
ADD COLUMN     "wordCountTargetMin" INTEGER;

