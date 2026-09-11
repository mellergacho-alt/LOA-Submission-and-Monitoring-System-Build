-- DropIndex
DROP INDEX "Submission_classSectionId_learningAreaId_termId_key";

-- AlterTable
ALTER TABLE "ClassSection" ADD COLUMN     "electiveFileTargets" JSONB NOT NULL DEFAULT '{}';

-- CreateIndex
CREATE INDEX "Submission_classSectionId_learningAreaId_termId_idx" ON "Submission"("classSectionId", "learningAreaId", "termId");
