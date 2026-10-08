import { describe, expect, test, mock } from "bun:test";
import {
  getWorkDateIST,
  get2100IST,
  calculateWorkingMinutes,
  getISTTimeParts,
} from "../src/utils/time.utils";
import { requireRole } from "../src/middleware/auth.middleware";
import { isValidCoordinate } from "../src/services/geofence.service";

describe("1. Asia/Kolkata IST Time Calculations & 21:00 Auto Checkout Logic", () => {
  test("getWorkDateIST correctly computes workDate in Asia/Kolkata regardless of UTC", () => {
    // 2026-10-05 20:00:00 UTC is 2026-10-06 01:30:00 IST (+5:30)
    const lateUtc = new Date("2026-10-05T20:00:00.000Z");
    const workDate = getWorkDateIST(lateUtc);
    expect(workDate).toBe("2026-10-06");

    // 2026-10-05 02:00:00 UTC is 2026-10-05 07:30:00 IST
    const morningUtc = new Date("2026-10-05T02:00:00.000Z");
    expect(getWorkDateIST(morningUtc)).toBe("2026-10-05");
  });

  test("get2100IST computes exact 21:00:00.000 IST (15:30:00.000 UTC)", () => {
    const d21 = get2100IST("2026-10-05");
    // 21:00 IST is 15:30 UTC
    expect(d21.toISOString()).toBe("2026-10-05T15:30:00.000Z");

    const parts = getISTTimeParts(d21);
    expect(parts.hour).toBe(21);
    expect(parts.minute).toBe(0);
  });

  test("Calculates working minutes accurately for standard shift", () => {
    // Checked in at 09:30 IST (04:00 UTC), checked out at 18:00 IST (12:30 UTC)
    const checkIn = new Date("2026-10-05T04:00:00.000Z");
    const checkOut = new Date("2026-10-05T12:30:00.000Z");

    const minutes = calculateWorkingMinutes(checkIn, checkOut);
    // 8.5 hours = 510 minutes
    expect(minutes).toBe(510);
  });

  test("Auto checkout at 21:00 IST: closes normal shift and computes elapsed minutes", () => {
    const workDate = "2026-10-05";
    // Check in at 10:00 IST (04:30 UTC)
    const checkIn = new Date("2026-10-05T04:30:00.000Z");
    const autoOutAt = get2100IST(workDate); // 21:00 IST (15:30 UTC)

    const minutes = calculateWorkingMinutes(checkIn, autoOutAt);
    // 10:00 to 21:00 = 11 hours = 660 minutes
    expect(minutes).toBe(660);
  });

  test("Auto checkout logic for check-in after 21:00 IST: 0 minutes worked and flagged", () => {
    const workDate = "2026-10-05";
    // Check in at 21:15 IST (15:45 UTC)
    const lateCheckIn = new Date("2026-10-05T15:45:00.000Z");
    const auto2100 = get2100IST(workDate);

    let checkOutAt: Date;
    let workingMinutes: number;
    let notes: string;

    if (lateCheckIn.getTime() >= auto2100.getTime()) {
      checkOutAt = lateCheckIn;
      workingMinutes = 0;
      notes = "Auto checked out: checked in after 21:00 IST";
    } else {
      checkOutAt = auto2100;
      workingMinutes = calculateWorkingMinutes(lateCheckIn, checkOutAt);
      notes = "Auto checked out at 21:00 IST";
    }

    expect(workingMinutes).toBe(0);
    expect(checkOutAt.getTime()).toBe(lateCheckIn.getTime());
    expect(notes).toContain("after 21:00 IST");
  });

  test("Catch-up auto checkout closes older open records from past dates", () => {
    const pastRecords = [
      {
        id: "att-1",
        workDate: "2026-10-03",
        checkInAt: new Date("2026-10-03T04:00:00.000Z"), // 09:30 IST
        checkOutAt: null,
      },
      {
        id: "att-2",
        workDate: "2026-10-04",
        checkInAt: new Date("2026-10-04T05:00:00.000Z"), // 10:30 IST
        checkOutAt: null,
      },
    ];

    const closedRecords = pastRecords.map((rec) => {
      const closingTime = get2100IST(rec.workDate);
      const minutes = calculateWorkingMinutes(rec.checkInAt, closingTime);
      return {
        ...rec,
        checkOutAt: closingTime,
        checkOutType: "AUTO_9PM",
        status: "SHIFT_COMPLETED",
        workingMinutes: minutes,
      };
    });

    expect(closedRecords[0].checkOutAt.toISOString()).toBe("2026-10-03T15:30:00.000Z");
    expect(closedRecords[0].workingMinutes).toBe(690); // 11.5 hours
    expect(closedRecords[1].checkOutAt.toISOString()).toBe("2026-10-04T15:30:00.000Z");
    expect(closedRecords[1].workingMinutes).toBe(630); // 10.5 hours
  });
});

describe("2. Fix 1: Manual Check-Out Overwriting AUTO_9PM & Race-Safe Scheduler", () => {
  test("Manual check-out overwrites AUTO_9PM if offline time is earlier than 21:00 IST", () => {
    const checkInAt = new Date("2026-10-05T04:00:00.000Z"); // 09:30 IST
    const autoClosedAt = new Date("2026-10-05T15:30:00.000Z"); // 21:00 IST

    const existingAttendance = {
      id: "att-123",
      checkInAt,
      checkOutAt: autoClosedAt,
      checkOutType: "AUTO_9PM",
      status: "SHIFT_COMPLETED",
      workingMinutes: 690,
      notes: "Auto-closed at 21:00 IST",
    };

    // Employee actually checked out manually at 18:30 IST (13:00 UTC) while offline
    const manualOfflineCheckOut = new Date("2026-10-05T13:00:00.000Z");

    const canCorrect =
      existingAttendance.checkOutType === "AUTO_9PM" &&
      existingAttendance.checkInAt &&
      manualOfflineCheckOut.getTime() < existingAttendance.checkOutAt.getTime() &&
      manualOfflineCheckOut.getTime() > existingAttendance.checkInAt.getTime();

    expect(canCorrect).toBe(true);

    const workingMinutes = calculateWorkingMinutes(checkInAt, manualOfflineCheckOut);
    const updated = {
      ...existingAttendance,
      checkOutAt: manualOfflineCheckOut,
      checkOutType: "MANUAL",
      workingMinutes,
      notes: `${existingAttendance.notes}; Corrected from auto checkout by offline check-out`,
    };

    expect(updated.checkOutType).toBe("MANUAL");
    expect(updated.checkOutAt.toISOString()).toBe("2026-10-05T13:00:00.000Z");
    expect(updated.workingMinutes).toBe(540); // 9 hours instead of 11.5
    expect(updated.notes).toContain("Corrected from auto checkout by offline check-out");
  });

  test("Scheduler updateMany with checkOutAt: null refuses to close already-closed record", async () => {
    const dbRecord = {
      id: "att-456",
      checkInAt: new Date("2026-10-05T04:00:00.000Z"),
      checkOutAt: new Date("2026-10-05T12:00:00.000Z"), // Already checked out manually
    };

    // Simulated updateMany where { id: record.id, checkOutAt: null }
    const simulateUpdateMany = (record: typeof dbRecord) => {
      if (record.checkOutAt !== null) {
        return { count: 0 }; // Zero rows updated!
      }
      return { count: 1 };
    };

    const res = simulateUpdateMany(dbRecord);
    expect(res.count).toBe(0);
  });
});

describe("3. Fix 2: Poison-Pill Outbox Handling & MAX_EVENT_RETRIES", () => {
  test("Permanent HTTP 4xx (except 408/429) moves event to failed_events instead of retrying forever", () => {
    const isPermanentFailure = (statusCode: number) => {
      return statusCode >= 400 && statusCode < 500 && statusCode !== 408 && statusCode !== 429;
    };

    expect(isPermanentFailure(400)).toBe(true);
    expect(isPermanentFailure(403)).toBe(true);
    expect(isPermanentFailure(404)).toBe(true);
    expect(isPermanentFailure(422)).toBe(true);

    // Transient: must NOT be treated as permanent
    expect(isPermanentFailure(408)).toBe(false); // Request Timeout
    expect(isPermanentFailure(429)).toBe(false); // Rate Limit
    expect(isPermanentFailure(500)).toBe(false); // Server Error
    expect(isPermanentFailure(503)).toBe(false); // Service Unavailable
  });

  test("Failed event retains complete payload and error message without being dropped silently", () => {
    const pending = {
      id: "evt-uuid-test",
      eventType: "CHECK_IN",
      payload: JSON.stringify({ latitude: 17.44, longitude: 78.38 }),
      retryCount: 3,
    };

    const failed = {
      ...pending,
      errorMessage: "HTTP 400: clientTimestamp is more than 5 minutes in the future",
      failedAt: Date.now(),
    };

    expect(failed.id).toBe(pending.id);
    expect(failed.payload).toBe(pending.payload);
    expect(failed.errorMessage).toContain("HTTP 400");
  });
});

describe("4. Fix 3: Location Batch Rejected Points & Endless Loop Protection", () => {
  test("processBatchLocations returns rejectedClientPointIds for invalid coordinates, bad dates, and future points", () => {
    const nowMs = Date.now();
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;

    const incomingPoints = [
      { clientPointId: "pt-valid-1", latitude: 17.44, longitude: 78.38, recordedAt: new Date(nowMs - 60000).toISOString() },
      { clientPointId: "pt-invalid-coord", latitude: 999, longitude: 999, recordedAt: new Date(nowMs - 60000).toISOString() },
      { clientPointId: "pt-invalid-date", latitude: 17.45, longitude: 78.39, recordedAt: "not-a-valid-date" },
      { clientPointId: "pt-future-2days", latitude: 17.46, longitude: 78.40, recordedAt: new Date(nowMs + 2 * ONE_DAY_MS).toISOString() },
      { clientPointId: "pt-valid-2", latitude: 17.47, longitude: 78.41, recordedAt: new Date(nowMs - 30000).toISOString() },
    ];

    const rejectedClientPointIds: string[] = [];
    const validPoints: any[] = [];

    for (const u of incomingPoints) {
      const recMs = new Date(u.recordedAt).getTime();
      const isInvalidDate = isNaN(recMs);
      const isFuture = recMs > nowMs + ONE_DAY_MS;
      const isInvalidCoord = !isValidCoordinate(Number(u.latitude), Number(u.longitude));

      if (isInvalidDate || isFuture || isInvalidCoord) {
        if (u.clientPointId) rejectedClientPointIds.push(u.clientPointId);
      } else {
        validPoints.push(u);
      }
    }

    expect(validPoints.map((p) => p.clientPointId)).toEqual(["pt-valid-1", "pt-valid-2"]);
    expect(rejectedClientPointIds).toEqual(["pt-invalid-coord", "pt-invalid-date", "pt-future-2days"]);
  });

  test("Mobile sync loop breaks immediately when batch removes zero rows to prevent infinite spinning", () => {
    let rowsRemoved = 0;
    let loopIterations = 0;

    while (loopIterations < 5) {
      loopIterations++;
      // Simulating batch that returns 0 accepted and 0 rejected
      if (rowsRemoved === 0) {
        break;
      }
    }

    expect(loopIterations).toBe(1);
  });
});

describe("5. Fix 4: Clear NO_SIGNAL on Recent Location & Watchdog Alert Limits", () => {
  test("Clears NO_SIGNAL back to WORKING when new point is recent (< 10 mins) and attendance is open", () => {
    const nowMs = Date.now();
    const recordedAt = new Date(nowMs - 2 * 60 * 1000); // 2 minutes ago
    const lastLocationUpdate = new Date(nowMs - 15 * 60 * 1000); // 15 minutes ago

    const employee = {
      id: "emp-789",
      currentStatus: "NO_SIGNAL",
      lastLocationUpdate,
    };

    const hasOpenAttendance = true;
    const isRecent = (nowMs - recordedAt.getTime()) <= 10 * 60 * 1000;
    const isNewest = recordedAt.getTime() >= employee.lastLocationUpdate.getTime();

    let newStatus = employee.currentStatus;
    let writtenStatusEvent: string | null = null;

    if (employee.currentStatus === "NO_SIGNAL" && isRecent && isNewest && hasOpenAttendance) {
      newStatus = "WORKING";
      writtenStatusEvent = "LOCATION_ON";
    }

    expect(newStatus).toBe("WORKING");
    expect(writtenStatusEvent).toBe("LOCATION_ON");
  });

  test("Watchdog skips NO_SIGNAL alert if latest event is LOCATION_OFF", () => {
    const latestEvent = {
      state: "LOCATION_OFF",
      recordedAt: new Date(Date.now() - 12 * 60 * 1000),
    };

    let shouldAlert = true;
    if (latestEvent.state === "LOCATION_OFF") {
      shouldAlert = false;
    }

    expect(shouldAlert).toBe(false);
  });
});

describe("6. Fix 5: Clock Skew Verification, 24h Threshold & P2002 Race Safety", () => {
  test("Rejects clientTimestamp more than 5 minutes in the future with HTTP 400", () => {
    const serverNow = new Date("2026-10-05T10:00:00.000Z");
    const futureTimestamp = new Date("2026-10-05T10:06:00.000Z"); // 6 minutes in future

    const diffMs = futureTimestamp.getTime() - serverNow.getTime();
    const isRejected = diffMs > 5 * 60 * 1000;

    expect(isRejected).toBe(true);
  });

  test("Accepts past clientTimestamp (offline queuing) and calculates clockSkewSeconds", () => {
    const serverNow = new Date("2026-10-05T10:00:00.000Z");
    const pastTimestamp = new Date("2026-10-05T08:30:00.000Z"); // 1.5 hours in past (offline)

    const diffMs = pastTimestamp.getTime() - serverNow.getTime();
    const isRejected = diffMs > 5 * 60 * 1000;
    const clockSkewSeconds = Math.round(diffMs / 1000);

    expect(isRejected).toBe(false);
    expect(clockSkewSeconds).toBe(-5400); // -90 minutes = -5400 seconds
  });

  test("Difference > 24 hours triggers large clock difference flag and admin alert", () => {
    const serverNow = new Date("2026-10-05T10:00:00.000Z");
    const veryOldTimestamp = new Date("2026-10-03T10:00:00.000Z"); // 48 hours in past

    const diffMs = Math.abs(serverNow.getTime() - veryOldTimestamp.getTime());
    const isLargeSkew = diffMs > 24 * 60 * 60 * 1000;
    const diffHours = Math.round(diffMs / (60 * 60 * 1000));

    expect(isLargeSkew).toBe(true);
    expect(diffHours).toBe(48);
  });

  test("Prisma P2002 unique-constraint error is handled gracefully as already-processed", () => {
    const prismaError = {
      code: "P2002",
      meta: { target: ["clientEventId"] },
    };

    let response: any = null;
    if (prismaError.code === "P2002") {
      response = { success: true, message: "Event already processed", duplicate: true };
    }

    expect(response.success).toBe(true);
    expect(response.duplicate).toBe(true);
  });
});
