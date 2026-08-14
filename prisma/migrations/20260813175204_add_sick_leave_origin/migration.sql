-- CreateEnum
CREATE TYPE "SickLeaveOrigin" AS ENUM ('COMMON_DISEASE', 'WORK_ACCIDENT', 'OCCUPATIONAL_DISEASE');

-- AlterTable
ALTER TABLE "PayrollNovelty" ADD COLUMN     "sickLeaveOrigin" "SickLeaveOrigin";
