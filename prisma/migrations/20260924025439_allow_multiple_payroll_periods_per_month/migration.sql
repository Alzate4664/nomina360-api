-- DropIndex
DROP INDEX "PayrollPeriod_companyId_year_month_payrollType_key";

-- CreateIndex
CREATE INDEX "PayrollPeriod_companyId_year_month_payrollType_idx" ON "PayrollPeriod"("companyId", "year", "month", "payrollType");
