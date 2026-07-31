/*
  Warnings:

  - You are about to drop the column `periodMonth` on the `PayrollNovelty` table. All the data in the column will be lost.
  - You are about to drop the column `periodYear` on the `PayrollNovelty` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "PayrollNovelty_companyId_periodYear_periodMonth_idx";

-- AlterTable
ALTER TABLE "PayrollNovelty" DROP COLUMN "periodMonth",
DROP COLUMN "periodYear";
