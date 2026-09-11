-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'GRADE_CHAIRMAN';

-- DropIndex
DROP INDEX "User_schoolId_key";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "gradeLevelId" INTEGER;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_gradeLevelId_fkey" FOREIGN KEY ("gradeLevelId") REFERENCES "GradeLevel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
