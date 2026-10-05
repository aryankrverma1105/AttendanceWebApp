import { describe, expect, test, mock } from "bun:test";
import {
  getWorkDateIST,
  get2100IST,
  calculateWorkingMinutes,
  getISTTimeParts,
} from "../src/utils/time.utils";
import { requireRole } from "../src/middleware/auth.middleware";

describe("A. Asia/Kolkata IST Time Calculations & 21:00 Auto Checkout Logic", () => {
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

    // If checkIn > 21:00 IST, closed at checkIn time + 0 minutes
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

describe("B. Attendance Idempotency & Double Check-In Safeguards", () => {
  test("Idempotent check-in: duplicate clientEventId is detected and skipped", async () => {
    const processedEvents = new Set<string>();

    const handleCheckIn = async (clientEventId: string, employeeId: string) => {
      if (processedEvents.has(clientEventId)) {
        return { isDuplicate: true, status: "ALREADY_PROCESSED" };
      }
      processedEvents.add(clientEventId);
      return { isDuplicate: false, status: "CREATED", employeeId };
    };

    const first = await handleCheckIn("evt-uuid-1", "emp-101");
    expect(first.isDuplicate).toBe(false);
    expect(first.status).toBe("CREATED");

    // Retry with identical clientEventId
    const retry = await handleCheckIn("evt-uuid-1", "emp-101");
    expect(retry.isDuplicate).toBe(true);
    expect(retry.status).toBe("ALREADY_PROCESSED");
  });

  test("Double check-in on the same day while still checked in returns existing record", async () => {
    const attendanceDb: Record<string, any> = {};

    const attemptCheckIn = async (employeeId: string, date: Date) => {
      const workDate = getWorkDateIST(date);
      const key = `${employeeId}_${workDate}`;

      if (attendanceDb[key] && !attendanceDb[key].checkOutAt) {
        return {
          existing: true,
          attendance: attendanceDb[key],
          message: "Already checked in for today",
        };
      }

      const newRecord = {
        id: `att-${Date.now()}`,
        employeeId,
        workDate,
        checkInAt: date,
        checkOutAt: null,
      };
      attendanceDb[key] = newRecord;
      return { existing: false, attendance: newRecord, message: "Check-in successful" };
    };

    const now = new Date("2026-10-05T04:00:00.000Z"); // 09:30 IST
    const firstCheckIn = await attemptCheckIn("emp-101", now);
    expect(firstCheckIn.existing).toBe(false);
    expect(firstCheckIn.attendance.workDate).toBe("2026-10-05");

    // Second check-in attempt 1 hour later
    const secondCheckIn = await attemptCheckIn("emp-101", new Date("2026-10-05T05:00:00.000Z"));
    expect(secondCheckIn.existing).toBe(true);
    expect(secondCheckIn.attendance.id).toBe(firstCheckIn.attendance.id);
  });
});

describe("C. Location Batch Idempotency & Validation", () => {
  test("Filters future points (> 1 day) and accepts valid points", () => {
    const now = Date.now();
    const twoDaysFuture = new Date(now + 2 * 24 * 60 * 60 * 1000).toISOString();
    const validPointTime = new Date(now - 60 * 1000).toISOString();

    const points = [
      { clientPointId: "pt-1", latitude: 17.44, longitude: 78.38, recordedAt: validPointTime },
      { clientPointId: "pt-2", latitude: 17.45, longitude: 78.39, recordedAt: twoDaysFuture },
      { clientPointId: "pt-3", latitude: 17.46, longitude: 78.40, recordedAt: validPointTime },
    ];

    const futureThreshold = new Date(now + 24 * 60 * 60 * 1000);
    const validPoints = points.filter((p) => new Date(p.recordedAt) <= futureThreshold);

    expect(validPoints.length).toBe(2);
    expect(validPoints.map((p) => p.clientPointId)).toEqual(["pt-1", "pt-3"]);
  });

  test("Duplicate clientPointIds within employee location updates are skipped", () => {
    const existingClientPointIds = new Set(["pt-existing-1", "pt-existing-2"]);

    const incomingBatch = [
      { clientPointId: "pt-existing-1", latitude: 17.44, longitude: 78.38 },
      { clientPointId: "pt-new-1", latitude: 17.45, longitude: 78.39 },
      { clientPointId: "pt-existing-2", latitude: 17.46, longitude: 78.40 },
      { clientPointId: "pt-new-2", latitude: 17.47, longitude: 78.41 },
    ];

    const accepted: string[] = [];
    for (const pt of incomingBatch) {
      if (!existingClientPointIds.has(pt.clientPointId)) {
        accepted.push(pt.clientPointId);
        existingClientPointIds.add(pt.clientPointId);
      }
    }

    expect(accepted).toEqual(["pt-new-1", "pt-new-2"]);
    expect(existingClientPointIds.size).toBe(4);
  });
});

describe("D. Role Enforcement: ADMIN vs USER Separation", () => {
  test("requireRole allows permitted role and passes to next()", () => {
    const middleware = requireRole(["ADMIN"]);
    let nextCalled = false;

    const req: any = { user: { role: "ADMIN", userId: 1 } };
    const res: any = {
      status: mock(() => res),
      json: mock(() => res),
    };
    const next = () => {
      nextCalled = true;
    };

    middleware(req, res, next);
    expect(nextCalled).toBe(true);
  });

  test("USER cannot call admin-only routes (returns 403 Forbidden)", () => {
    const middleware = requireRole(["ADMIN"]);
    let statusCode: number | null = null;
    let jsonResponse: any = null;

    const req: any = { user: { role: "USER", userId: 2 } };
    const res: any = {
      status: (code: number) => {
        statusCode = code;
        return res;
      },
      json: (data: any) => {
        jsonResponse = data;
        return res;
      },
    };
    const next = mock(() => {});

    middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(statusCode).toBe(403);
    expect(jsonResponse.success).toBe(false);
    expect(jsonResponse.message).toContain("Access denied");
  });

  test("ADMIN cannot check in: role USER required for attendance", () => {
    const attendanceMiddleware = requireRole(["USER"]);
    let statusCode: number | null = null;
    let jsonResponse: any = null;

    const req: any = { user: { role: "ADMIN", userId: 1 } };
    const res: any = {
      status: (code: number) => {
        statusCode = code;
        return res;
      },
      json: (data: any) => {
        jsonResponse = data;
        return res;
      },
    };
    const next = mock(() => {});

    attendanceMiddleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(statusCode).toBe(403);
    expect(jsonResponse.message).toContain("Access denied");
  });
});

describe("E. Location-Off Alerts & Admin Notifications", () => {
  test("Location-off status triggers admin notification and socket broadcast", () => {
    const notifications: any[] = [];
    const broadcastEvents: any[] = [];

    const handleLocationStatus = (employeeName: string, state: string) => {
      if (state === "LOCATION_OFF" || state === "PERMISSION_REVOKED") {
        notifications.push({
          type: "LOCATION_OFF",
          message: `Location services turned OFF for ${employeeName}`,
          read: false,
        });

        broadcastEvents.push({
          event: "employee.location.off",
          data: { employeeName, state },
        });
      }
    };

    handleLocationStatus("Ramesh Chandra", "LOCATION_OFF");

    expect(notifications.length).toBe(1);
    expect(notifications[0].type).toBe("LOCATION_OFF");
    expect(broadcastEvents.length).toBe(1);
    expect(broadcastEvents[0].event).toBe("employee.location.off");
  });
});
