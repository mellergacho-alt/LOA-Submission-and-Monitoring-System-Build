-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('LOA_RESULT', 'TEST_QUESTIONNAIRE', 'TABLE_OF_SPECIFICATIONS');

-- DropIndex
DROP INDEX "ExamSchedule_termId_examType_key";

-- DropIndex
DROP INDEX "Submission_classSectionId_learningAreaId_termId_examType_idx";

-- AlterTable
ALTER TABLE "ExamSchedule" ADD COLUMN     "documentType" "DocumentType" NOT NULL DEFAULT 'LOA_RESULT';

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "documentType" "DocumentType" NOT NULL DEFAULT 'LOA_RESULT';

-- CreateIndex
CREATE UNIQUE INDEX "ExamSchedule_termId_examType_documentType_key" ON "ExamSchedule"("termId", "examType", "documentType");

-- CreateIndex
CREATE INDEX "Submission_classSectionId_learningAreaId_termId_examType_do_idx" ON "Submission"("classSectionId", "learningAreaId", "termId", "examType", "documentType");
