import type { Request, Response } from "express";
import prisma from "../config/prisma";
import { getTodayDateString, calculateLiveWorkingMinutes } from "../services/attendance.service";
import { getWorkDateIST, calculateWorkingMinutes, getISTTimeParts } from "../utils/time.utils";
import { broadcastEvent } from "../services/socket.service";
import { evaluateAssignedGeofences, isValidCoordinate } from "../services/geofence.service";

async function notifyAdminsOfMock(employeeName: string, eventType: string, coords: { lat?: number; lng?: number }) {
  try {
    const admins = await prisma.user.findMany({ where: { role: "ADMIN" } });
    for (const admin of admins) {
      await prisma.notification.create({
        data: {
          recipientUserId: admin.id,
          type: "ANOMALY",
          title: "Mock Location Detected",
          message: `User ${employeeName} submitted a mock/spoofed GPS location during ${eventType} (${coords.lat ?? "N/A"}, ${coords.lng ?? "N/A"}).`,
        },
      });
    }
    broadcastEvent("anomaly.detected", {
      employeeName,
      reason: "MOCK_LOCATION",
      eventType,
      coordinates: coords,
    });
  } catch (err) {
    console.error("[Attendance] Failed to notify admins of mock location:", err);
  }
}

export async function checkIn(req: Request, res: Response) {
  try {
    const authRole = ((req as any).user?.role || "").toUpperCase();
    const userId = (req as any).user?.userId;

    if (authRole === "ADMIN") {
      return res.status(403).json({
        success: false,
        message: "ADMIN accounts must never have attendance, tracking or check-in",
      });
    }

    const { latitude, longitude, accuracy, isMock, clientEventId, clientTimestamp } = req.body;

    if (!clientEventId) {
      return res.status(400).json({ success: false, message: "clientEventId (UUID) is required" });
    }

    const employee = await prisma.employee.findUnique({
      where: { userId: Number(userId) },
      include: {
        user: true,
        defaultShift: true,
        geofenceAssignments: { include: { geofence: true } },
      },
    });

    if (!employee) {
      return res.status(404).json({ success: false, message: "Employee profile not found" });
    }

    const checkInTime = clientTimestamp ? new Date(clientTimestamp) : new Date();
    const workDate = getWorkDateIST(checkInTime);

    // 1. Idempotency check on ProcessedClientEvent
    const alreadyProcessed = await prisma.processedClientEvent.findUnique({
      where: { clientEventId },
    });

    if (alreadyProcessed) {
      const existing = await prisma.attendance.findUnique({
        where: {
          employeeId_workDate: {
            employeeId: employee.id,
            workDate,
          },
        },
      });
      return res.status(200).json({
        success: true,
        message: "Event already processed",
        data: existing,
        duplicate: true,
      });
    }

    // 2. Check if already checked in today
    const existingAttendance = await prisma.attendance.findUnique({
      where: {
        employeeId_workDate: {
          employeeId: employee.id,
          workDate,
        },
      },
    });

    if (existingAttendance && existingAttendance.status === "WORKING" && !existingAttendance.checkOutAt) {
      // Record clientEventId so future retries are also idempotent
      await prisma.processedClientEvent.create({
        data: {
          clientEventId,
          eventType: "CHECK_IN",
          employeeId: employee.id,
        },
      });

      return res.status(200).json({
        success: true,
        message: "Already checked in",
        data: existingAttendance,
        alreadyCheckedIn: true,
      });
    }

    // 3. Mock location flag & admin notification
    const lat = latitude !== undefined && latitude !== null ? Number(latitude) : undefined;
    const lng = longitude !== undefined && longitude !== null ? Number(longitude) : undefined;
    const isMockBool = Boolean(isMock);

    if (isMockBool) {
      await notifyAdminsOfMock(employee.user.name || employee.employeeCode, "CHECK_IN", { lat, lng });
    }

    // 4. Geofence evaluation (optional indicator, never blocks check-in)
    let insideGeofence = false;
    let matchedGeofenceName: string | undefined;

    if (lat !== undefined && lng !== undefined && isValidCoordinate(lat, lng)) {
      const assignedGeofences = (employee.geofenceAssignments || [])
        .filter((a: any) => a.geofence?.active)
        .map((a: any) => ({
          id: a.geofence.id,
          name: a.geofence.name,
          type: a.geofence.type,
          latitude: a.geofence.latitude,
          longitude: a.geofence.longitude,
          radiusMeters: a.geofence.radiusMeters,
        }));

      if (assignedGeofences.length > 0) {
        const evalResult = evaluateAssignedGeofences(
          { latitude: lat, longitude: lng, accuracy: accuracy ? Number(accuracy) : undefined },
          assignedGeofences
        );
        insideGeofence = evalResult.result === "INSIDE";
        matchedGeofenceName = evalResult.geofenceName;
      }
    }

    // 5. Shift & Late arrival calculation
    const shift = employee.defaultShift || (await prisma.shift.findFirst());
    let isLate = false;
    if (shift) {
      const [sh, sm] = shift.startTime.split(":").map(Number);
      const istParts = getISTTimeParts(checkInTime);
      const checkInMinutes = istParts.hour * 60 + istParts.minute;
      const expectedMinutes = sh * 60 + sm + (shift.gracePeriodMinutes || 15);
      isLate = checkInMinutes > expectedMinutes;
    }

    // 6. Upsert Attendance record
    const attendance = await prisma.attendance.upsert({
      where: {
        employeeId_workDate: {
          employeeId: employee.id,
          workDate,
        },
      },
      create: {
        employeeId: employee.id,
        shiftId: shift?.id,
        workDate,
        checkInAt: checkInTime,
        checkInLat: lat,
        checkInLng: lng,
        status: "WORKING",
        isLateArrival: isLate,
        workingMinutes: 0,
        breakMinutes: 0,
      },
      update: {
        checkInAt: existingAttendance?.checkInAt || checkInTime,
        checkInLat: existingAttendance?.checkInLat ?? lat,
        checkInLng: existingAttendance?.checkInLng ?? lng,
        checkOutAt: null,
        checkOutType: null,
        status: "WORKING",
      },
    });

    // 7. Update Employee status & last coordinates
    await prisma.employee.update({
      where: { id: employee.id },
      data: {
        currentStatus: "WORKING",
        isLocationOff: false,
        ...(lat !== undefined && lng !== undefined
          ? {
              lastLatitude: lat,
              lastLongitude: lng,
              lastLocationUpdate: checkInTime,
            }
          : {}),
      },
    });

    // 8. Record ProcessedClientEvent
    await prisma.processedClientEvent.create({
      data: {
        clientEventId,
        eventType: "CHECK_IN",
        employeeId: employee.id,
      },
    });

    // 9. Broadcast socket events
    const empName = employee.user.name || employee.user.username;
    broadcastEvent("attendance.checked_in", {
      employeeId: employee.id,
      employeeName: empName,
      checkInAt: checkInTime.toISOString(),
      workDate,
      status: "WORKING",
      isLateArrival: isLate,
      insideGeofence,
      geofenceName: matchedGeofenceName,
      isMock: isMockBool,
    });
    broadcastEvent("employee.status.changed", {
      employeeId: employee.id,
      employeeName: empName,
      status: "WORKING",
    });

    return res.status(200).json({
      success: true,
      message: "Checked in successfully",
      data: attendance,
      insideGeofence,
      isLateArrival: isLate,
    });
  } catch (error: any) {
    console.error("[Attendance] check-in error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function checkOut(req: Request, res: Response) {
  try {
    const authRole = ((req as any).user?.role || "").toUpperCase();
    const userId = (req as any).user?.userId;

    if (authRole === "ADMIN") {
      return res.status(403).json({
        success: false,
        message: "ADMIN accounts must never have attendance, tracking or check-in",
      });
    }

    const { latitude, longitude, accuracy, isMock, clientEventId, clientTimestamp } = req.body;

    if (!clientEventId) {
      return res.status(400).json({ success: false, message: "clientEventId (UUID) is required" });
    }

    const employee = await prisma.employee.findUnique({
      where: { userId: Number(userId) },
      include: {
        user: true,
        defaultShift: true,
      },
    });

    if (!employee) {
      return res.status(404).json({ success: false, message: "Employee profile not found" });
    }

    const checkOutTime = clientTimestamp ? new Date(clientTimestamp) : new Date();
    const workDate = getWorkDateIST(checkOutTime);

    // 1. Idempotency check on ProcessedClientEvent
    const alreadyProcessed = await prisma.processedClientEvent.findUnique({
      where: { clientEventId },
    });

    if (alreadyProcessed) {
      const existing = await prisma.attendance.findUnique({
        where: {
          employeeId_workDate: {
            employeeId: employee.id,
            workDate,
          },
        },
      });
      return res.status(200).json({
        success: true,
        message: "Event already processed",
        data: existing,
        duplicate: true,
      });
    }

    // 2. Fetch today's attendance record (or fallback to latest open record)
    let attendance = await prisma.attendance.findUnique({
      where: {
        employeeId_workDate: {
          employeeId: employee.id,
          workDate,
        },
      },
    });

    if (!attendance) {
      // Check if there is an unclosed session from an earlier shift
      attendance = await prisma.attendance.findFirst({
        where: {
          employeeId: employee.id,
          checkOutAt: null,
          checkInAt: { not: null },
        },
        orderBy: { workDate: "desc" },
      });
    }

    if (!attendance || !attendance.checkInAt) {
      return res.status(400).json({
        success: false,
        message: "No active check-in found for today",
      });
    }

    if (attendance.checkOutAt && attendance.status !== "WORKING") {
      // Already checked out
      await prisma.processedClientEvent.create({
        data: {
          clientEventId,
          eventType: "CHECK_OUT",
          employeeId: employee.id,
        },
      });

      return res.status(200).json({
        success: true,
        message: "Already checked out",
        data: attendance,
        alreadyCheckedOut: true,
      });
    }

    // 3. Mock location flag & admin notification
    const lat = latitude !== undefined && latitude !== null ? Number(latitude) : undefined;
    const lng = longitude !== undefined && longitude !== null ? Number(longitude) : undefined;
    const isMockBool = Boolean(isMock);

    if (isMockBool) {
      await notifyAdminsOfMock(employee.user.name || employee.employeeCode, "CHECK_OUT", { lat, lng });
    }

    // 4. Calculate working minutes & shift early/overtime
    const workingMinutes = calculateWorkingMinutes(
      attendance.checkInAt,
      checkOutTime,
      attendance.breakMinutes || 0
    );

    const shift = employee.defaultShift || (await prisma.shift.findFirst());
    let isEarly = false;
    let overtimeMinutes = 0;

    if (shift) {
      const [eh, em] = shift.endTime.split(":").map(Number);
      const istParts = getISTTimeParts(checkOutTime);
      const checkOutMinutes = istParts.hour * 60 + istParts.minute;
      const shiftEndMinutes = eh * 60 + em;

      if (checkOutMinutes < shiftEndMinutes) {
        isEarly = true;
      } else if (checkOutMinutes > shiftEndMinutes + 15) {
        overtimeMinutes = checkOutMinutes - shiftEndMinutes;
      }
    }

    // 5. Update Attendance
    const updatedAttendance = await prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        checkOutAt: checkOutTime,
        checkOutLat: lat,
        checkOutLng: lng,
        checkOutType: "MANUAL",
        status: "SHIFT_COMPLETED",
        workingMinutes,
        overtimeMinutes,
        isEarlyDeparture: isEarly,
      },
    });

    // 6. Update Employee status
    await prisma.employee.update({
      where: { id: employee.id },
      data: {
        currentStatus: "SHIFT_COMPLETED",
        ...(lat !== undefined && lng !== undefined
          ? {
              lastLatitude: lat,
              lastLongitude: lng,
              lastLocationUpdate: checkOutTime,
            }
          : {}),
      },
    });

    // 7. Record ProcessedClientEvent
    await prisma.processedClientEvent.create({
      data: {
        clientEventId,
        eventType: "CHECK_OUT",
        employeeId: employee.id,
      },
    });

    // 8. Broadcast socket events
    const empName = employee.user.name || employee.user.username;
    broadcastEvent("attendance.checked_out", {
      employeeId: employee.id,
      employeeName: empName,
      checkOutAt: checkOutTime.toISOString(),
      workDate: attendance.workDate,
      status: "SHIFT_COMPLETED",
      workingMinutes,
      checkOutType: "MANUAL",
      isMock: isMockBool,
    });
    broadcastEvent("employee.status.changed", {
      employeeId: employee.id,
      employeeName: empName,
      status: "SHIFT_COMPLETED",
    });

    return res.status(200).json({
      success: true,
      message: "Checked out successfully",
      data: updatedAttendance,
    });
  } catch (error: any) {
    console.error("[Attendance] check-out error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function getAttendanceRecords(req: Request, res: Response) {
  try {
    const { employeeId, date, status } = req.query;

    const authRole = ((req as any).user?.role || "").toUpperCase();
    const authEmployeeId = (req as any).user?.employeeId;
    const isPrivileged = authRole === "ADMIN";

    const where: any = {};
    if (isPrivileged) {
      if (employeeId) where.employeeId = employeeId as string;
    } else {
      if (!authEmployeeId) {
        return res.status(200).json({ success: true, count: 0, data: [] });
      }
      where.employeeId = authEmployeeId;
    }
    if (date) where.workDate = date as string;
    if (status) where.status = status as string;

    const records = await prisma.attendance.findMany({
      where,
      include: {
        employee: {
          include: {
            user: {
              select: { id: true, name: true, email: true, photoUrl: true },
            },
            department: true,
            defaultShift: true,
          },
        },
        shift: true,
      },
      orderBy: { workDate: "desc" },
    });

    const now = new Date();
    const enrichedRecords = records.map((rec) => {
      if (rec.status === "WORKING" && rec.checkInAt) {
        const liveWorking = calculateLiveWorkingMinutes(
          rec.checkInAt,
          rec.breakMinutes || 0,
          now
        );
        return {
          ...rec,
          workingMinutes: Math.max(rec.workingMinutes || 0, liveWorking),
        };
      }
      return rec;
    });

    return res.status(200).json({ success: true, count: enrichedRecords.length, data: enrichedRecords });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function getAttendanceSummary(req: Request, res: Response) {
  try {
    const todayStr = getTodayDateString();

    const employees = await prisma.employee.findMany({
      include: {
        attendances: {
          where: { workDate: todayStr },
        },
        leaveRequests: {
          where: {
            status: "APPROVED",
            startDate: { lte: todayStr },
            endDate: { gte: todayStr },
          },
        },
      },
    });

    let working = 0;
    let remote = 0;
    let away = 0;
    let onLeave = 0;
    let overtime = 0;
    let offline = 0;

    const now = Date.now();
    const STALE_THRESHOLD_MS = 15 * 60 * 1000; // 15 mins

    for (const emp of employees) {
      const isStale = !emp.lastLocationUpdate || now - new Date(emp.lastLocationUpdate).getTime() > STALE_THRESHOLD_MS;

      if (emp.leaveRequests.length > 0) {
        onLeave++;
      } else if (emp.currentStatus === "WORKING") {
        working++;
      } else if (emp.currentStatus === "REMOTE_WORKING") {
        remote++;
      } else if (emp.currentStatus === "AWAY") {
        away++;
      } else if (emp.currentStatus === "OVERTIME") {
        overtime++;
      } else {
        offline++;
      }
    }

    const total = employees.length;
    const activeWorkingTotal = working + remote + overtime;
    const attendanceRate = total > 0 ? Math.round((activeWorkingTotal / total) * 100) : 0;

    return res.status(200).json({
      success: true,
      today: todayStr,
      summary: {
        total,
        working,
        remote,
        away,
        onLeave,
        overtime,
        offline,
        attendanceRate,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function exportAttendanceCsv(req: Request, res: Response) {
  try {
    const records = await prisma.attendance.findMany({
      include: {
        employee: {
          include: {
            user: true,
            department: true,
          },
        },
        shift: true,
      },
      orderBy: { workDate: "desc" },
    });

    const now = new Date();
    const headers = [
      "Date",
      "Employee Code",
      "Name",
      "Department",
      "Shift",
      "Check In",
      "Check Out",
      "Status",
      "Working Minutes",
      "Break Minutes",
      "Overtime Minutes",
      "Late Arrival",
      "Early Departure",
    ];

    const rows = records.map((r) => {
      let workingMinutes = r.workingMinutes || 0;
      if (r.status === "WORKING" && r.checkInAt) {
        const live = calculateLiveWorkingMinutes(r.checkInAt, r.breakMinutes || 0, now);
        workingMinutes = Math.max(workingMinutes, live);
      }

      return [
        r.workDate,
        `"${r.employee.employeeCode}"`,
        `"${r.employee.user.name || r.employee.user.username}"`,
        `"${r.employee.department?.name || "N/A"}"`,
        `"${r.shift?.name || "Standard"}"`,
        r.checkInAt ? r.checkInAt.toISOString() : "N/A",
        r.checkOutAt ? r.checkOutAt.toISOString() : "In Session",
        r.status,
        workingMinutes,
        r.breakMinutes || 0,
        r.overtimeMinutes || 0,
        r.isLateArrival ? "Yes" : "No",
        r.isEarlyDeparture ? "Yes" : "No",
      ];
    });

    const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="attendance_report.csv"');
    return res.status(200).send(csvContent);
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}
