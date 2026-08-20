-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('PAID', 'UNPAID');

-- AlterEnum
ALTER TYPE "NoveltyType" ADD VALUE 'LEAVE';

-- AlterTable
ALTER TABLE "PayrollNovelty" ADD COLUMN     "leaveType" "LeaveType";
