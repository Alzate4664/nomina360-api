-- AlterTable
ALTER TABLE "EmploymentTermination" ADD COLUMN     "calculatedAt" TIMESTAMP(3),
ADD COLUMN     "calculatedBaseSalary" DECIMAL(65,30),
ADD COLUMN     "earnedTotal" DECIMAL(65,30),
ADD COLUMN     "salaryDays" INTEGER,
ADD COLUMN     "serviceBonusDays" INTEGER,
ADD COLUMN     "severanceDays" INTEGER;

-- CreateTable
CREATE TABLE "EmploymentTerminationConcept" (
    "id" TEXT NOT NULL,
    "employmentTerminationId" TEXT NOT NULL,
    "conceptCode" TEXT NOT NULL,
    "conceptName" TEXT NOT NULL,
    "type" "ConceptType" NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmploymentTerminationConcept_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmploymentTerminationConcept_employmentTerminationId_idx" ON "EmploymentTerminationConcept"("employmentTerminationId");

-- AddForeignKey
ALTER TABLE "EmploymentTerminationConcept" ADD CONSTRAINT "EmploymentTerminationConcept_employmentTerminationId_fkey" FOREIGN KEY ("employmentTerminationId") REFERENCES "EmploymentTermination"("id") ON DELETE CASCADE ON UPDATE CASCADE;
