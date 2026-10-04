import type { Request, Response } from "express";
import prisma from "../config/prisma";
import { getTodayDateString, calculateLiveWorkingMinutes } from "../services/attendance.service";

export async function getAttendanceRecords(req: Request, res: Response) {
  try {
    const { employeeId, date, status } = req.query;

    // A plain EMPLOYEE can only ever see their own attendance — the employeeId filter is
    // theirs alone, never client-chosen, or they could page through every coworker's data.
    const authRole = ((req as any).user?.role || "").toUpperCase();
    const authEmployeeId = (req as any).user?.employeeId;
    const isPrivileged = authRole === "ADMIN" || authRole === "MANAGER";

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
