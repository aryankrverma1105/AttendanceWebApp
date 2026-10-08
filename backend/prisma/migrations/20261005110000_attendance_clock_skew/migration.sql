-- AlterTable: Add clockSkewSeconds and receivedAt to Attendance
ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "clockSkewSeconds" INTEGER;
ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
