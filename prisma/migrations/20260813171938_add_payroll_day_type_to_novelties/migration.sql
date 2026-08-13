-- CreateEnum
CREATE TYPE "PayrollDayType" AS ENUM ('REGULAR', 'SUNDAY', 'HOLIDAY');

-- AlterTable
ALTER TABLE "PayrollNovelty" ADD COLUMN     "dayType" "PayrollDayType" NOT NULL DEFAULT 'REGULAR';
