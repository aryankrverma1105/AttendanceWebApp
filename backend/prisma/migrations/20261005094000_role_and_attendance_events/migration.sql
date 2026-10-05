-- Migration: 20261005094000_role_and_attendance_events
-- 1. Safely convert Role enum to ADMIN, USER only (converts existing MANAGER and EMPLOYEE rows to USER)
CREATE TYPE "Role_new" AS ENUM ('ADMIN', 'USER');

ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;

ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING (
  CASE
    WHEN "role"::text = 'ADMIN' THEN 'ADMIN'::"Role_new"
    ELSE 'USER'::"Role_new"
  END
);

DROP TYPE "Role";
ALTER TYPE "Role_new" RENAME TO "Role";

ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'USER';

-- 2. Add manual check-in/out coordinates & checkout type to Attendance
ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "checkInLat" DOUBLE PRECISION;
ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "checkInLng" DOUBLE PRECISION;
ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "checkOutLat" DOUBLE PRECISION;
ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "checkOutLng" DOUBLE PRECISION;
ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "checkOutType" TEXT;

CREATE INDEX IF NOT EXISTS "Attendance_workDate_employeeId_idx" ON "Attendance"("workDate", "employeeId");

-- 2b. Add isLocationOff to Employee
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "isLocationOff" BOOLEAN NOT NULL DEFAULT false;

-- 3. Create ProcessedClientEvent table for idempotency
CREATE TABLE IF NOT EXISTS "ProcessedClientEvent" (
    "id" TEXT NOT NULL,
    "clientEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "employeeId" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedClientEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProcessedClientEvent_clientEventId_key" ON "ProcessedClientEvent"("clientEventId");

-- 4. Add clientPointId and indexes to LocationUpdate
ALTER TABLE "LocationUpdate" ADD COLUMN IF NOT EXISTS "clientPointId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "LocationUpdate_employeeId_clientPointId_key" ON "LocationUpdate"("employeeId", "clientPointId");
CREATE INDEX IF NOT EXISTS "LocationUpdate_employeeId_recordedAt_idx" ON "LocationUpdate"("employeeId", "recordedAt");

-- 5. Create LocationStatusEvent table
CREATE TABLE IF NOT EXISTS "LocationStatusEvent" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "clientEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationStatusEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LocationStatusEvent_clientEventId_key" ON "LocationStatusEvent"("clientEventId");
CREATE INDEX IF NOT EXISTS "LocationStatusEvent_employeeId_at_idx" ON "LocationStatusEvent"("employeeId", "at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'LocationStatusEvent_employeeId_fkey'
  ) THEN
    ALTER TABLE "LocationStatusEvent" ADD CONSTRAINT "LocationStatusEvent_employeeId_fkey" 
      FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
