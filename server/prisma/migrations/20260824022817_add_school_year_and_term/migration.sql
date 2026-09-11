-- CreateTable
CREATE TABLE "SchoolYear" (
    "id" SERIAL NOT NULL,
    "label" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Term" (
    "id" SERIAL NOT NULL,
    "schoolYearId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Term_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SchoolYear_label_key" ON "SchoolYear"("label");

-- CreateIndex
CREATE UNIQUE INDEX "Term_schoolYearId_name_key" ON "Term"("schoolYearId", "name");

-- AddForeignKey
ALTER TABLE "Term" ADD CONSTRAINT "Term_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DataMigration: bootstrap the initial SchoolYear + its 3 Terms from whatever
-- SystemSetting currently holds (falling back to the app's long-standing
-- defaults if the table is empty, e.g. on a fresh database).
INSERT INTO "SchoolYear" ("label", "isActive", "updatedAt")
SELECT COALESCE((SELECT "schoolYear" FROM "SystemSetting" WHERE id = 1), '2026-2027'), true, CURRENT_TIMESTAMP;

INSERT INTO "Term" ("schoolYearId", "name", "isActive")
SELECT sy.id, t.name, (t.name = COALESCE((SELECT "term" FROM "SystemSetting" WHERE id = 1), 'Second'))
FROM "SchoolYear" sy, (VALUES ('First'), ('Second'), ('Third')) AS t(name)
WHERE sy."label" = COALESCE((SELECT "schoolYear" FROM "SystemSetting" WHERE id = 1), '2026-2027');

-- AlterTable: add termId, backfill every existing Submission from its old
-- "term" string against the bootstrap SchoolYear above, then enforce NOT NULL.
ALTER TABLE "Submission" ADD COLUMN "termId" INTEGER;

UPDATE "Submission" s
SET "termId" = t.id
FROM "Term" t
JOIN "SchoolYear" sy ON sy.id = t."schoolYearId"
WHERE t.name = s.term
  AND sy."label" = COALESCE((SELECT "schoolYear" FROM "SystemSetting" WHERE id = 1), '2026-2027');

ALTER TABLE "Submission" ALTER COLUMN "termId" SET NOT NULL;

-- DropIndex (old term-string uniqueness)
DROP INDEX "Submission_classSectionId_learningAreaId_term_key";

-- AlterTable: drop the now-superseded term string column
ALTER TABLE "Submission" DROP COLUMN "term";

-- CreateIndex (new termId-based uniqueness)
CREATE UNIQUE INDEX "Submission_classSectionId_learningAreaId_termId_key" ON "Submission"("classSectionId", "learningAreaId", "termId");

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DropTable: superseded by SchoolYear.isActive / Term.isActive
DROP TABLE "SystemSetting";
