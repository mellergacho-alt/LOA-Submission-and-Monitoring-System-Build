-- CreateTable
CREATE TABLE "SystemSetting" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "schoolYear" TEXT NOT NULL DEFAULT '2026-2027',
    "term" TEXT NOT NULL DEFAULT 'Second',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);
