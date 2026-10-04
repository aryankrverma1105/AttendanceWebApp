import type { Request, Response } from "express";
import prisma from "../config/prisma";

export async function getPerformanceScorecards(req: Request, res: Response) {
  try {
    const employees = await prisma.employee.findMany({
      include: {
        user: {
          select: { id: true, name: true, email: true, photoUrl: true },
        },
        department: true,
        attendances: {
          take: 30,
          orderBy: { workDate: "desc" },
        },
        geofenceEvents: {
          take: 30,
        },
      },
    });

    const scorecards = employees.map((emp) => {
      const totalSessions = emp.attendances.length;
      const lateArrivals = emp.attendances.filter((a) => a.isLateArrival).length;
      const onTimeRate = totalSessions > 0 ? Math.round(((totalSessions - lateArrivals) / totalSessions) * 100) : 100;
      const totalHours = Math.round(emp.attendances.reduce((acc, a) => acc + (a.workingMinutes || 0), 0) / 60);
      const totalOvertimeHours = Math.round(emp.attendances.reduce((acc, a) => acc + (a.overtimeMinutes || 0), 0) / 60);

      // Geofence adherence calculation
      const breaches = emp.geofenceEvents.filter((e) => e.eventType === "GEOFENCE_BREACH").length;
      const adherenceScore = Math.max(70, Math.round(100 - breaches * 5));

      // Overall composite score
      const overallScore = Math.round(onTimeRate * 0.5 + adherenceScore * 0.5);

      return {
        id: emp.id,
        employeeCode: emp.employeeCode,
        name: emp.user.name || emp.user.email,
        photoUrl: emp.user.photoUrl,
        department: emp.department?.name || "General",
        onTimeRate,
        adherenceScore,
        overallScore,
        totalHours,
        totalOvertimeHours,
        currentStatus: emp.currentStatus,
      };
    });

    // Sort by overallScore descending (ranking)
    scorecards.sort((a, b) => b.overallScore - a.overallScore);

    return res.status(200).json({ success: true, count: scorecards.length, data: scorecards });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}
