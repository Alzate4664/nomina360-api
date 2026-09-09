-- AlterTable
ALTER TABLE "EmploymentTermination" ADD COLUMN     "pendingVacationDays" DECIMAL(65,30),
ADD COLUMN     "unpaidSalaryStartDate" TIMESTAMP(3);
