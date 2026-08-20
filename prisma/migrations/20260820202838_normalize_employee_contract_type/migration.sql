-- CreateEnum
CREATE TYPE "ContractType" AS ENUM (
  'INDEFINITE',
  'FIXED_TERM',
  'WORK_OR_LABOR',
  'APPRENTICESHIP'
);

-- Normalize legacy contract type values
UPDATE "Employee"
SET "contractType" = 'INDEFINITE'
WHERE "contractType" = 'Indefinido';

-- Convert the existing TEXT column without losing data
ALTER TABLE "Employee"
ALTER COLUMN "contractType" TYPE "ContractType"
USING ("contractType"::text::"ContractType");

-- Add optional end date for contracts that have one
ALTER TABLE "Employee"
ADD COLUMN "contractEndDate" TIMESTAMP(3);