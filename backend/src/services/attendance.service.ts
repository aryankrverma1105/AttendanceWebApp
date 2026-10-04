import prisma from "../config/prisma";
import { broadcastEvent } from "./socket.service";

/**
 * Checks if current time is within or approaching shift window (including grace period)
 */
export function isTimeInShiftWindow(
  now: Date,
  startTimeStr: string,
  endTimeStr: string,
  gracePeriodMinutes: number = 15
): { isInShift: boolean; isBeforeShift: boolean; isAfterShift: boolean; shiftEndToday: Date } {
  const parts1 = startTimeStr.split(":").map(Number);
  const parts2 = endTimeStr.split(":").map(Number);
  const startH = parts1[0] ?? 0;
  const startM = parts1[1] ?? 0;
  const endH = parts2[0] ?? 0;
  const endM = parts2[1] ?? 0;

  const startToday = new Date(now);
  startToday.setHours(startH, startM - gracePeriodMinutes, 0, 0);

  const endToday = new Date(now);
  endToday.setHours(endH, endM, 0, 0);

  // Midnight crossing shift: e.g. 22:00 -> 06:00
  if (endH < startH || (endH === startH && endM < startM)) {
    if (now.getHours() < endH || (now.getHours() === endH && now.getMinutes() <= endM)) {
      // It's after midnight, shift started yesterday
      startToday.setDate(startToday.getDate() - 1);
    } else {
      // It's before midnight, shift ends tomorrow
      endToday.setDate(endToday.getDate() + 1);
    }
  }

  const isInShift = now >= startToday && now <= endToday;
  const isBeforeShift = now < startToday;
  const isAfterShift = now > endToday;

  return { isInShift, isBeforeShift, isAfterShift, shiftEndToday: endToday };
}

/**
 * Calculates overtime minutes between actual checkout and shift end
 */
export function calculateOvertimeMinutes(
  checkoutTime: Date,
  shiftEnd: Date,
  minimumThresholdMinutes: number = 15
): number {
  if (checkoutTime <= shiftEnd) return 0;
  const diffMs = checkoutTime.getTime() - shiftEnd.getTime();
  const diffMinutes = Math.floor(diffMs / (60 * 1000));
  return diffMinutes >= minimumThresholdMinutes ? diffMinutes : 0;
}

/**
 * Calculates live working minutes between check-in and reference time, deducting break minutes
 */
export function calculateLiveWorkingMinutes(
  checkInAt: Date | string | null,
  breakMinutes: number = 0,
  asOfTime: Date = new Date()
): number {
  if (!checkInAt) return 0;
  const inMs = new Date(checkInAt).getTime();
  const elapsedMs = asOfTime.getTime() - inMs;
  if (elapsedMs <= 0) return 0;
  return Math.max(0, Math.floor(elapsedMs / (60 * 1000)) - (breakMinutes || 0));
}

export function getTodayDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function processAttendanceOnConfirmedEntry(
  employeeId: string,
  geofenceId: string,
  geofenceName: string,
  observationTime: Date = new Date()
) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: {
      user: true,
      defaultShift: true,
      leaveRequests: {
        where: {
          status: "APPROVED",
        },
      },
    },
  });

  if (!employee) return null;

  const todayStr = getTodayDateString(observationTime);

  // 1. Check if employee is on approved leave today
  const onApprovedLeave = employee.leaveRequests.some((leave) => {
    return todayStr >= leave.startDate && todayStr <= leave.endDate;
  });

  if (onApprovedLeave) {
    console.log(`[Attendance] ${employee.user.name} is on approved leave today. Excluded from normal auto check-in.`);
    return null;
  }

  // 2. Fetch or create today's attendance record
  let attendance = await prisma.attendance.findUnique({
    where: {
      employeeId_workDate: {
        employeeId: employee.id,
        workDate: todayStr,
      },
    },
  });

  const shift = employee.defaultShift || (await prisma.shift.findFirst());
  const isLate = shift ? (() => {
    const [h, m] = shift.startTime.split(":").map(Number);
    const expected = new Date(observationTime);
    expected.setHours(h, m + shift.gracePeriodMinutes, 0, 0);
    return observationTime > expected;
  })() : false;

  if (!attendance) {
    // Initial check-in of the day
    attendance = await prisma.attendance.create({
      data: {
        employeeId: employee.id,
        shiftId: shift?.id,
        workDate: todayStr,
        checkInAt: observationTime,
        status: "WORKING",
        isLateArrival: isLate,
        workingMinutes: 0,
        breakMinutes: 0,
      },
    });

    // Update employee status
    await prisma.employee.update({
      where: { id: employee.id },
      data: { currentStatus: "WORKING" },
    });

    // Create Geofence Event
    await prisma.geofenceEvent.create({
      data: {
        employeeId: employee.id,
        geofenceId,
        eventType: isLate ? "LATE_ARRIVAL" : "CHECK_IN",
        occurredAt: observationTime,
      },
    });

    // Create Notification
    await prisma.notification.create({
      data: {
        recipientUserId: employee.userId,
        type: isLate ? "LATE_ARRIVAL" : "CHECK_IN",
        title: isLate ? "Late Arrival Flagged" : "Checked In Automatically",
        message: isLate
          ? `You checked in at ${geofenceName} at ${observationTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}, past the scheduled start (${shift?.startTime || "09:00"} + ${shift?.gracePeriodMinutes || 15}m grace).`
          : `Welcome! You have been checked in at ${geofenceName} at ${observationTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`,
      },
    });

    // Broadcast Realtime Event
    broadcastEvent("attendance.checked_in", {
      employeeId: employee.id,
      employeeName: employee.user.name || employee.user.username,
      geofenceName,
      checkInAt: observationTime.toISOString(),
      status: "WORKING",
      isLate,
      isLateArrival: isLate,
      workingMinutes: 0,
      breakMinutes: 0,
    });

    broadcastEvent("employee.status.changed", {
      employeeId: employee.id,
      employeeName: employee.user.name || employee.user.username,
      status: "WORKING",
      geofenceName,
    });

    console.log(`[Attendance] Auto check-in completed for ${employee.user.name} at ${geofenceName} (Late: ${isLate})`);
  } else {
    // Re-entering after being AWAY, having checked out earlier, or returning to perimeter
    if (attendance.checkOutAt || attendance.status === "AWAY" || attendance.status === "SHIFT_COMPLETED") {
      // Calculate how long the employee was away between previous checkOutAt and observationTime
      let additionalBreakMins = 0;
      if (attendance.checkOutAt) {
        const awayMs = observationTime.getTime() - new Date(attendance.checkOutAt).getTime();
        if (awayMs > 0) {
          additionalBreakMins = Math.round(awayMs / (60 * 1000));
        }
      }

      const newBreakMinutes = (attendance.breakMinutes || 0) + additionalBreakMins;
      const currentWorkingMins = calculateLiveWorkingMinutes(
        attendance.checkInAt,
        newBreakMinutes,
        observationTime
      );

      attendance = await prisma.attendance.update({
        where: { id: attendance.id },
        data: {
          status: "WORKING",
          checkOutAt: null, // Clear checkout timestamp because employee is actively on-site working now!
          breakMinutes: newBreakMinutes,
          workingMinutes: currentWorkingMins,
          isEarlyDeparture: false, // Employee returned to work
        },
      });

      await prisma.employee.update({
        where: { id: employee.id },
        data: { currentStatus: "WORKING" },
      });

      await prisma.geofenceEvent.create({
        data: {
          employeeId: employee.id,
          geofenceId,
          eventType: "ENTER",
          occurredAt: observationTime,
        },
      });

      await prisma.notification.create({
        data: {
          recipientUserId: employee.userId,
          type: "CHECK_IN",
          title: "Session Resumed",
          message: `Welcome back to ${geofenceName}! Work session resumed at ${observationTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}${additionalBreakMins > 0 ? ` after ${additionalBreakMins}m away` : ""}. Total working time: ${Math.floor(currentWorkingMins / 60)}h ${currentWorkingMins % 60}m.`,
        },
      });

      broadcastEvent("employee.status.changed", {
        employeeId: employee.id,
        employeeName: employee.user.name || employee.user.username,
        status: "WORKING",
        geofenceName,
      });

      broadcastEvent("attendance.updated", {
        employeeId: employee.id,
        employeeName: employee.user.name || employee.user.username,
        geofenceName,
        status: "WORKING",
        workingMinutes: currentWorkingMins,
        breakMinutes: newBreakMinutes,
        checkOutAt: null,
      });

      console.log(
        `[Attendance] ${employee.user.name} resumed WORKING at ${geofenceName} (Total working: ${currentWorkingMins}m, Total breaks: ${newBreakMinutes}m)`
      );
    }
  }

  return attendance;
}

export async function processAttendanceOnConfirmedExit(
  employeeId: string,
  geofenceId?: string,
  observationTime: Date = new Date(),
  geofenceName?: string
) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: { user: true, defaultShift: true },
  });

  if (!employee) return null;
  const todayStr = getTodayDateString(observationTime);

  const attendance = await prisma.attendance.findUnique({
    where: {
      employeeId_workDate: {
        employeeId: employee.id,
        workDate: todayStr,
      },
    },
  });

  if (!attendance || attendance.status === "AWAY" || attendance.status === "SHIFT_COMPLETED") {
    return null;
  }

  const shift = employee.defaultShift || (await prisma.shift.findFirst());
  let newStatus = "AWAY";
  let overtimeMins = 0;
  let isEarly = false;

  if (shift) {
    const { isAfterShift, shiftEndToday } = isTimeInShiftWindow(
      observationTime,
      shift.startTime,
      shift.endTime,
      shift.gracePeriodMinutes
    );

    if (isAfterShift) {
      overtimeMins = calculateOvertimeMinutes(observationTime, shiftEndToday, 15);
      newStatus = "SHIFT_COMPLETED";
    } else {
      // Exited before shift end -> flag as early departure
      isEarly = true;
      newStatus = "AWAY";
    }
  }

  // Calculate cumulative on-site working minutes up to this departure
  const workingMins = calculateLiveWorkingMinutes(
    attendance.checkInAt,
    attendance.breakMinutes || 0,
    observationTime
  );

  const updatedAttendance = await prisma.attendance.update({
    where: { id: attendance.id },
    data: {
      status: newStatus,
      checkOutAt: observationTime,
      workingMinutes: workingMins,
      overtimeMinutes: overtimeMins,
      isEarlyDeparture: isEarly,
    },
  });

  await prisma.employee.update({
    where: { id: employee.id },
    data: { currentStatus: newStatus },
  });

  const eventType = isEarly
    ? "EARLY_DEPARTURE"
    : newStatus === "SHIFT_COMPLETED"
    ? "CHECK_OUT"
    : "EXIT";

  await prisma.geofenceEvent.create({
    data: {
      employeeId: employee.id,
      geofenceId,
      eventType,
      occurredAt: observationTime,
    },
  });

  // Create notification for employee
  await prisma.notification.create({
    data: {
      recipientUserId: employee.userId,
      type: isEarly ? "EARLY_DEPARTURE" : "CHECK_OUT",
      title: isEarly ? "Early Departure Flagged" : "Checked Out Automatically",
      message: isEarly
        ? `You exited ${geofenceName || "work perimeter"} at ${observationTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} before shift end (${shift?.endTime || "18:00"}). Flagged as early departure.`
        : `You checked out from ${geofenceName || "work site"} at ${observationTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. Total working time: ${Math.floor(workingMins / 60)}h ${workingMins % 60}m.`,
    },
  });

  // Broadcast Realtime Events
  broadcastEvent("employee.status.changed", {
    employeeId: employee.id,
    employeeName: employee.user.name || employee.user.username,
    status: newStatus,
    geofenceName,
    isEarlyDeparture: isEarly,
  });

  broadcastEvent("attendance.checked_out", {
    employeeId: employee.id,
    employeeName: employee.user.name || employee.user.username,
    geofenceName,
    checkOutAt: observationTime.toISOString(),
    workingMinutes: workingMins,
    overtimeMinutes: overtimeMins,
    isEarlyDeparture: isEarly,
    status: newStatus,
  });

  console.log(
    `[Attendance] Departure recorded for ${employee.user.name}: status=${newStatus}, isEarly=${isEarly}, checkOutAt=${observationTime.toISOString()}`
  );

  return updatedAttendance;
}
