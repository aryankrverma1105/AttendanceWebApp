import type { Request, Response } from "express";
import prisma from "../config/prisma";
import { processLocationUpdate, processBatchLocations, resolveEmployee } from "../services/location.service";

/**
 * A caller's own employeeId (from their token) always wins over any employeeId in the
 * request body — otherwise any authenticated employee could submit fake GPS/attendance
 * data for a coworker just by naming their id. Only ADMIN/MANAGER may target another
 * employee explicitly (e.g. internal tooling), and only when their own token has no
 * employeeId of its own.
 */
function resolveTargetEmployeeId(req: Request, bodyEmployeeId?: string): string | undefined {
  const authRole = ((req as any).user?.role || "").toUpperCase();
  const authEmployeeId = (req as any).user?.employeeId;
  const isPrivileged = authRole === "ADMIN" || authRole === "MANAGER";
  return authEmployeeId || (isPrivileged ? bodyEmployeeId : undefined);
}

export async function submitLocation(req: Request, res: Response) {
  try {
    const { employeeId, latitude, longitude, accuracy, speed, heading, isMock, recordedAt } = req.body;

    const authUserId = (req as any).user?.userId;
    const targetEmployeeId = resolveTargetEmployeeId(req, employeeId);

    if ((!targetEmployeeId && !authUserId) || latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        success: false,
        message: "employeeId (or authenticated user session), latitude, and longitude are required",
      });
    }

    const result = await processLocationUpdate(
      targetEmployeeId || String(authUserId),
      {
        latitude: Number(latitude),
        longitude: Number(longitude),
        accuracy: accuracy !== undefined ? Number(accuracy) : null,
        speed: speed !== undefined ? Number(speed) : null,
        heading: heading !== undefined ? Number(heading) : null,
        isMock: Boolean(isMock),
        recordedAt: recordedAt || new Date().toISOString(),
      },
      authUserId
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function submitBatchLocations(req: Request, res: Response) {
  try {
    const { employeeId, locations } = req.body;

    const authUserId = (req as any).user?.userId;
    const targetEmployeeId = resolveTargetEmployeeId(req, employeeId);

    if ((!targetEmployeeId && !authUserId) || !Array.isArray(locations) || locations.length === 0) {
      return res.status(400).json({ success: false, message: "employeeId and locations array are required" });
    }

    const result = await processBatchLocations(targetEmployeeId || String(authUserId), locations, authUserId);
    return res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function getLocationHistory(req: Request, res: Response) {
  try {
    const id = req.params["id"] as string;
    const authRole = ((req as any).user?.role || "").toUpperCase();
    const authEmployeeId = (req as any).user?.employeeId;
    const isPrivileged = authRole === "ADMIN" || authRole === "MANAGER";
    if (!isPrivileged && id !== authEmployeeId) {
      return res.status(403).json({ success: false, message: "Forbidden: you can only view your own location history" });
    }

    const history = await prisma.locationUpdate.findMany({
      where: { employeeId: id },
      orderBy: { recordedAt: "desc" },
      take: 100,
    });
    return res.status(200).json({ success: true, count: history.length, data: history });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Simulator endpoint: allows immediate trigger of demo events:
 * Action: 'enter_site' | 'leave_site' | 'return_site' | 'overtime'
 */
export async function simulateEmployeeMovement(req: Request, res: Response) {
  try {
    const { employeeId, action = "enter_site" } = req.body;
    const authUserId = (req as any).user?.userId;

    const employee = await resolveEmployee(employeeId, authUserId);

    if (!employee) {
      return res.status(404).json({ success: false, message: "Employee not found" });
    }

    let targetGeofence = employee.geofenceAssignments?.[0]?.geofence;
    if (!targetGeofence) {
      targetGeofence = await prisma.geofence.findFirst({ where: { active: true } });
    }

    if (!targetGeofence) {
      return res.status(400).json({ success: false, message: "No active geofence available for simulation" });
    }

    let lat: number;
    let lng: number;

    if (action === "enter_site" || action === "return_site") {
      // Coordinate right in the middle of assigned geofence
      lat = targetGeofence.latitude + 0.0001;
      lng = targetGeofence.longitude + 0.0001;
    } else {
      // Coordinate 1 km outside of assigned geofence
      lat = targetGeofence.latitude + 0.015;
      lng = targetGeofence.longitude + 0.015;
    }

    // Send 2 consecutive samples to satisfy state machine confirmation windows
    const res1 = await processLocationUpdate(employee.id, {
      latitude: lat,
      longitude: lng,
      accuracy: 10,
      recordedAt: new Date(),
    }, employee.userId);

    const res2 = await processLocationUpdate(employee.id, {
      latitude: lat + 0.00005,
      longitude: lng + 0.00005,
      accuracy: 12,
      recordedAt: new Date(Date.now() + 1000),
    }, employee.userId);

    return res.status(200).json({
      success: true,
      action,
      employee: employee.employeeCode,
      geofence: targetGeofence.name,
      finalState: res2.state,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}
