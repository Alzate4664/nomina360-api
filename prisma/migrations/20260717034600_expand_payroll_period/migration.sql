/*
  Warnings:

  - A unique constraint covering the columns `[companyId,year,month,payrollType]` on the table `PayrollPeriod` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "PayrollType" AS ENUM ('MONTHLY', 'SEMIMONTHLY', 'WEEKLY', 'BIWEEKLY', 'BONUS', 'SEVERANCE', 'TERMINATION', 'EXTRAORDINARY');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PayrollStatus" ADD VALUE 'COLLECTING_NOVELTIES';
ALTER TYPE "PayrollStatus" ADD VALUE 'CALCULATING';
ALTER TYPE "PayrollStatus" ADD VALUE 'CLOSED';
ALTER TYPE "PayrollStatus" ADD VALUE 'REOPENED';

-- DropIndex
DROP INDEX "PayrollPeriod_companyId_year_month_key";

-- AlterTable
ALTER TABLE "PayrollPeriod" ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "closedById" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "endDate" TIMESTAMP(3),
ADD COLUMN     "name" TEXT,
ADD COLUMN     "paymentDate" TIMESTAMP(3),
ADD COLUMN     "payrollType" "PayrollType" NOT NULL DEFAULT 'MONTHLY',
ADD COLUMN     "startDate" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "PayrollPeriod_companyId_status_idx" ON "PayrollPeriod"("companyId", "status");

-- CreateIndex
CREATE INDEX "PayrollPeriod_companyId_startDate_endDate_idx" ON "PayrollPeriod"("companyId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "PayrollPeriod_createdAt_idx" ON "PayrollPeriod"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollPeriod_companyId_year_month_payrollType_key" ON "PayrollPeriod"("companyId", "year", "month", "payrollType");
