-- CreateEnum
CREATE TYPE "ExamType" AS ENUM ('DIAGNOSTIC_TEST', 'SUMMATIVE_TEST_1', 'SUMMATIVE_TEST_2', 'END_OF_TERM_EXAM');

-- DropIndex
DROP INDEX "Submission_classSectionId_learningAreaId_termId_idx";

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "examType" "ExamType" NOT NULL DEFAULT 'DIAGNOSTIC_TEST';

-- CreateTable
CREATE TABLE "ExamSchedule" (
    "id" SERIAL NOT NULL,
    "termId" INTEGER NOT NULL,
    "examType" "ExamType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "startDate" TIMESTAMP(3),
    "deadline" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExamSchedule_termId_examType_key" ON "ExamSchedule"("termId", "examType");

-- CreateIndex
CREATE INDEX "Submission_classSectionId_learningAreaId_termId_examType_idx" ON "Submission"("classSectionId", "learningAreaId", "termId", "examType");

-- AddForeignKey
ALTER TABLE "ExamSchedule" ADD CONSTRAINT "ExamSchedule_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE CASCADE ON UPDATE CASCADE;
