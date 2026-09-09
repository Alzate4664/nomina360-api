-- CreateEnum
CREATE TYPE "TerminationReason" AS ENUM ('RESIGNATION', 'MUTUAL_AGREEMENT', 'FIXED_TERM_END', 'WORK_OR_LABOR_END', 'EMPLOYER_JUST_CAUSE', 'EMPLOYER_WITHOUT_JUST_CAUSE', 'OTHER');

-- CreateEnum
CREATE TYPE "TerminationStatus" AS ENUM ('DRAFT', 'CALCULATED', 'APPROVED', 'CLOSED');

-- CreateTable
CREATE TABLE "EmploymentTermination" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "terminationDate" TIMESTAMP(3) NOT NULL,
    "reason" "TerminationReason" NOT NULL,
    "status" "TerminationStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmploymentTermination_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmploymentTermination_companyId_idx" ON "EmploymentTermination"("companyId");

-- CreateIndex
CREATE INDEX "EmploymentTermination_employeeId_idx" ON "EmploymentTermination"("employeeId");

-- CreateIndex
CREATE INDEX "EmploymentTermination_companyId_status_idx" ON "EmploymentTermination"("companyId", "status");

-- CreateIndex
CREATE INDEX "EmploymentTermination_terminationDate_idx" ON "EmploymentTermination"("terminationDate");

-- AddForeignKey
ALTER TABLE "EmploymentTermination" ADD CONSTRAINT "EmploymentTermination_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmploymentTermination" ADD CONSTRAINT "EmploymentTermination_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
