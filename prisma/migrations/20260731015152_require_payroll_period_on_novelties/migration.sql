/*
  Warnings:

  - Made the column `payrollPeriodId` on table `PayrollNovelty` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "PayrollNovelty" DROP CONSTRAINT "PayrollNovelty_payrollPeriodId_fkey";

-- AlterTable
ALTER TABLE "PayrollNovelty" ALTER COLUMN "payrollPeriodId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "PayrollNovelty" ADD CONSTRAINT "PayrollNovelty_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "PayrollPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
