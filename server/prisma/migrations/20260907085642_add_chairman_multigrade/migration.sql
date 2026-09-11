-- AlterTable: add the new columns first (kept alongside the old one briefly
-- so the backfill below has both to read from and write to).
ALTER TABLE "User" ADD COLUMN     "gradeLevelIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "multigrade" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: every existing chairman's single gradeLevelId becomes a
-- 1-element gradeLevelIds array (multigrade stays false, its column default).
UPDATE "User" SET "gradeLevelIds" = ARRAY["gradeLevelId"] WHERE "gradeLevelId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_gradeLevelId_fkey";

-- AlterTable: now safe to drop the old single-value column.
ALTER TABLE "User" DROP COLUMN "gradeLevelId";
