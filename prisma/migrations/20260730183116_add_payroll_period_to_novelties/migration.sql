-- AlterTable
ALTER TABLE "PayrollNovelty" ADD COLUMN     "payrollPeriodId" TEXT;

-- CreateIndex
CREATE INDEX "PayrollNovelty_companyId_periodYear_periodMonth_idx" ON "PayrollNovelty"("companyId", "periodYear", "periodMonth");

-- CreateIndex
CREATE INDEX "PayrollNovelty_payrollPeriodId_idx" ON "PayrollNovelty"("payrollPeriodId");

-- AddForeignKey
ALTER TABLE "PayrollNovelty" ADD CONSTRAINT "PayrollNovelty_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "PayrollPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
