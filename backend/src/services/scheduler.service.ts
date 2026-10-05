/**
 * Scheduled Jobs for Sologix Energy
 * 1. Auto-Checkout at 21:00 Asia/Kolkata + Startup Catch-up
 * 2. 10-Minute No-Signal Watchdog for Checked-in Field Personnel
 */

import prisma from "../config/prisma";
import {
  getWorkDateIST,
  getISTTimeParts,
  get2100IST,
  calculateWorkingMinutes,
} from "../utils/time.utils";
import { getSocketServer } from "./socket.service";

/**
 * Closes open attendance records eligible for auto-checkout.
 * Runs on startup (catch-up) and every minute via scheduler.
 */
export async function runAutoCheckoutJob(): Promise<number> {
  const todayIST = getWorkDateIST();
  const { hour } = getISTTimeParts();
  const isPast21IST = hour >= 21;

  // Find all attendance records with checkInAt set and checkOutAt null
  const openRecords = await prisma.attendance.findMany({
    where: {
      checkInAt: { not: null },
      checkOutAt: null,
    },
    include: {
      employee: {
        include: { user: true },
      },
    },
  });

  let closedCount = 0;
  const io = getSocketServer();

  for (const record of openRecords) {
    const isPastDay = record.workDate < todayIST;
    const isTodayPast21 = record.workDate === todayIST && isPast21IST;

    // Only close if it's from a past workDate, or today past 21:00 IST
    if (!isPastDay && !isTodayPast21) {
      continue;
    }

    const checkInAt = record.checkInAt!;
    const scheduled2100 = get2100IST(record.workDate);

    let checkOutAt: Date;
    let workingMinutes: number;
    let notes = record.notes || "";

    if (checkInAt.getTime() >= scheduled2100.getTime()) {
      // User checked in after 21:00 IST -> close at check-in time + 0 minutes and flag with a note
      checkOutAt = checkInAt;
      workingMinutes = 0;
      notes = notes ? `${notes} | Auto-closed: checked in after 21:00 IST` : "Auto-closed: checked in after 21:00 IST";
    } else {
      checkOutAt = scheduled2100;
      workingMinutes = calculateWorkingMinutes(checkInAt, checkOutAt);
    }

    // Update attendance record
    await prisma.attendance.update({
      where: { id: record.id },
      data: {
        checkOutAt,
        checkOutType: "AUTO_9PM",
        status: "SHIFT_COMPLETED",
        workingMinutes,
        notes,
      },
    });

    // Update employee status
    await prisma.employee.update({
      where: { id: record.employeeId },
      data: {
        currentStatus: "SHIFT_COMPLETED",
      },
    });

    // Send notification to the user
    if (record.employee?.userId) {
      await prisma.notification.create({
        data: {
          recipientUserId: record.employee.userId,
          type: "CHECK_OUT",
          title: "Shift Auto-Completed",
          message: `Your shift for ${record.workDate} was automatically concluded at 21:00 IST. Total working time: ${workingMinutes} mins.`,
        },
      });
    }

    // Broadcast realtime event
    if (io) {
      io.emit("attendance.checked_out", {
        employeeId: record.employeeId,
        employeeName: record.employee?.user?.name || record.employee?.employeeCode,
        workDate: record.workDate,
        checkOutAt: checkOutAt.toISOString(),
        checkOutType: "AUTO_9PM",
        workingMinutes,
      });

      io.emit("employee.status.changed", {
        employeeId: record.employeeId,
        status: "SHIFT_COMPLETED",
      });
    }

    closedCount++;
  }

  if (closedCount > 0) {
    console.log(`[Auto-Checkout] Closed ${closedCount} open attendance records at 21:00 IST.`);
  }

  return closedCount;
}

/**
 * 10-Minute No-Signal Watchdog
 * Checked-in user with no location update for >10 mins is marked NO_SIGNAL and admins are notified once.
 */
export async function runNoSignalWatchdogJob(): Promise<number> {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

  // Find active employees who are currently checked in (open attendance)
  const activeAttendances = await prisma.attendance.findMany({
    where: {
      checkInAt: { not: null },
      checkOutAt: null,
    },
    select: {
      employeeId: true,
    },
  });

  if (activeAttendances.length === 0) return 0;

  const activeEmployeeIds = activeAttendances.map((a) => a.employeeId);

  // Find employees whose lastLocationUpdate is older than 10 mins (or null) and not yet marked NO_SIGNAL
  const stalledEmployees = await prisma.employee.findMany({
    where: {
      id: { in: activeEmployeeIds },
      currentStatus: { not: "NO_SIGNAL" },
      OR: [
        { lastLocationUpdate: { lt: tenMinutesAgo } },
        { lastLocationUpdate: null },
      ],
    },
    include: {
      user: true,
    },
  });

  if (stalledEmployees.length === 0) return 0;

  const io = getSocketServer();
  const adminUsers = await prisma.user.findMany({
    where: { role: "ADMIN", isActive: true },
    select: { id: true },
  });

  for (const emp of stalledEmployees) {
    const now = new Date();

    // 1. Update employee status to NO_SIGNAL
    await prisma.employee.update({
      where: { id: emp.id },
      data: { currentStatus: "NO_SIGNAL" },
    });

    // 2. Record status event
    await prisma.locationStatusEvent.create({
      data: {
        employeeId: emp.id,
        state: "NO_SIGNAL",
        at: now,
      },
    });

    // 3. Notify all admins once
    const name = emp.user?.name || emp.employeeCode;
    for (const admin of adminUsers) {
      await prisma.notification.create({
        data: {
          recipientUserId: admin.id,
          type: "NO_SIGNAL",
          title: "Personnel No Signal Alert",
          message: `${name} has sent no GPS location for over 10 minutes while checked in.`,
        },
      });
    }

    // 4. Emit realtime alerts
    if (io) {
      io.emit("employee.location.off", {
        employeeId: emp.id,
        employeeName: name,
        state: "NO_SIGNAL",
        at: now.toISOString(),
      });

      io.emit("employee.status.changed", {
        employeeId: emp.id,
        status: "NO_SIGNAL",
      });
    }
  }

  console.log(`[Watchdog] Flagged ${stalledEmployees.length} stalled personnel as NO_SIGNAL.`);
  return stalledEmployees.length;
}

let intervalHandle: NodeJS.Timeout | null = null;

/**
 * Initializes scheduled background jobs and executes startup catch-up.
 */
export function startBackgroundScheduler(): void {
  console.log("[Scheduler] Initializing background jobs (Auto-Checkout & Watchdog)...");

  // Run catch-up immediately on startup
  runAutoCheckoutJob().catch((err) =>
    console.error("[Scheduler] Startup auto-checkout catch-up error:", err)
  );

  runNoSignalWatchdogJob().catch((err) =>
    console.error("[Scheduler] Startup no-signal watchdog error:", err)
  );

  // Schedule to run every 60 seconds
  if (!intervalHandle) {
    intervalHandle = setInterval(async () => {
      try {
        await runAutoCheckoutJob();
        await runNoSignalWatchdogJob();
      } catch (err) {
        console.error("[Scheduler] Error in recurring background job:", err);
      }
    }, 60 * 1000);
  }
}

export function stopBackgroundScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
