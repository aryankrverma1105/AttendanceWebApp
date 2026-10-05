import type { Request, Response } from "express";
import prisma from "../config/prisma";
import { processLocationUpdate, processBatchLocations, resolveEmployee } from "../services/location.service";
import { broadcastEvent } from "../services/socket.service";

/**
 * A caller's own employeeId (from their token) always wins over any employeeId in the
 * request body — otherwise any authenticated employee could submit fake GPS/attendance
 * data for a coworker just by naming their id. Only ADMIN may target another
 * employee explicitly (e.g. internal tooling), and only when their own token has no
 * employeeId of its own.
 */
function resolveTargetEmployeeId(req: Request, bodyEmployeeId?: string): string | undefined {
  const authRole = ((req as any).user?.role || "").toUpperCase();
  const authEmployeeId = (req as any).user?.employeeId;
  const isPrivileged = authRole === "ADMIN";
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
    const isPrivileged = authRole === "ADMIN";
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

export async function reportLocationStatus(req: Request, res: Response) {
  try {
    const authRole = ((req as any).user?.role || "").toUpperCase();
    const authUserId = (req as any).user?.userId;

    if (authRole === "ADMIN") {
      return res.status(400).json({ success: false, message: "ADMIN accounts do not report location status" });
    }

    const { state, at, clientEventId } = req.body;
    if (!state || !["LOCATION_OFF", "PERMISSION_REVOKED", "LOCATION_ON"].includes(state)) {
      return res.status(400).json({
        success: false,
        message: "state must be one of: LOCATION_OFF, PERMISSION_REVOKED, LOCATION_ON",
      });
    }

    const employee = await resolveEmployee(undefined, authUserId);
    if (!employee) {
      return res.status(404).json({ success: false, message: "Employee profile not found" });
    }

    // Check idempotency with clientEventId
    if (clientEventId) {
      const existing = await prisma.locationStatusEvent.findUnique({
        where: { clientEventId },
      });
      if (existing) {
        return res.status(200).json({ success: true, message: "Event already recorded", duplicate: true });
      }
    }

    const eventTime = at ? new Date(at) : new Date();

    await prisma.locationStatusEvent.create({
      data: {
        employeeId: employee.id,
        state,
        at: eventTime,
        clientEventId,
      },
    });

    const isOff = state === "LOCATION_OFF" || state === "PERMISSION_REVOKED";

    await prisma.employee.update({
      where: { id: employee.id },
      data: { isLocationOff: isOff },
    });

    const empName = employee.user.name || employee.user.username;

    if (isOff) {
      // Notify all admins and broadcast event
      try {
        const admins = await prisma.user.findMany({ where: { role: "ADMIN" } });
        for (const admin of admins) {
          await prisma.notification.create({
            data: {
              recipientUserId: admin.id,
              type: "LOCATION_OFF",
              title: "Employee Location Off",
              message: `${empName} reported ${state === "PERMISSION_REVOKED" ? "location permissions revoked" : "location services turned OFF"} at ${eventTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`,
            },
          });
        }
      } catch (err) {
        console.error("[Location] Failed to notify admins of location off:", err);
      }

      broadcastEvent("employee.location.off", {
        employeeId: employee.id,
        employeeName: empName,
        state,
        at: eventTime.toISOString(),
      });
    } else {
      broadcastEvent("employee.location.on", {
        employeeId: employee.id,
        employeeName: empName,
        state,
        at: eventTime.toISOString(),
      });
    }

    return res.status(200).json({ success: true, message: "Location status updated", state });
  } catch (error: any) {
    console.error("[Location] reportLocationStatus error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
