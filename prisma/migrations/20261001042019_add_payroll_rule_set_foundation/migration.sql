-- CreateEnum
CREATE TYPE "PayrollRuleSetStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- AlterTable
ALTER TABLE "EmploymentTermination" ADD COLUMN     "calculatedRuleSetId" TEXT;

-- AlterTable
ALTER TABLE "PayrollPeriod" ADD COLUMN     "calculatedRuleSetId" TEXT;

-- CreateTable
CREATE TABLE "PayrollRuleSet" (
    "id" TEXT NOT NULL,
    "jurisdictionCode" VARCHAR(2) NOT NULL,
    "version" INTEGER NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "status" "PayrollRuleSetStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "rulesPayload" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollRuleSet_pkey" PRIMARY KEY ("id")
);

-- Domain invariants
ALTER TABLE "PayrollRuleSet"
ADD CONSTRAINT "PayrollRuleSet_version_positive_check"
CHECK ("version" > 0);

ALTER TABLE "PayrollRuleSet"
ADD CONSTRAINT "PayrollRuleSet_schemaVersion_positive_check"
CHECK ("schemaVersion" > 0);

ALTER TABLE "PayrollRuleSet"
ADD CONSTRAINT "PayrollRuleSet_effective_range_check"
CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom");

-- CreateIndex
CREATE INDEX "PayrollRuleSet_jurisdictionCode_status_effectiveFrom_effect_idx" ON "PayrollRuleSet"("jurisdictionCode", "status", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRuleSet_jurisdictionCode_version_key" ON "PayrollRuleSet"("jurisdictionCode", "version");

-- CreateIndex
CREATE INDEX "EmploymentTermination_calculatedRuleSetId_idx" ON "EmploymentTermination"("calculatedRuleSetId");

-- CreateIndex
CREATE INDEX "PayrollPeriod_calculatedRuleSetId_idx" ON "PayrollPeriod"("calculatedRuleSetId");

-- AddForeignKey
ALTER TABLE "EmploymentTermination" ADD CONSTRAINT "EmploymentTermination_calculatedRuleSetId_fkey" FOREIGN KEY ("calculatedRuleSetId") REFERENCES "PayrollRuleSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_calculatedRuleSetId_fkey" FOREIGN KEY ("calculatedRuleSetId") REFERENCES "PayrollRuleSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
