-- AlterTable
ALTER TABLE "ExamSchedule" ADD COLUMN     "allowedFileTypes" TEXT[] DEFAULT ARRAY[]::TEXT[];
