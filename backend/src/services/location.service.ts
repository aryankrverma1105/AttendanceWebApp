import prisma from "../config/prisma";
import { evaluateAssignedGeofences, isValidCoordinate } from "./geofence.service";
import { stateMachine } from "./state-machine.service";
import {
  processAttendanceOnConfirmedEntry,
  processAttendanceOnConfirmedExit,
  getTodayDateString,
  calculateLiveWorkingMinutes,
} from "./attendance.service";
import { checkLocationAnomaly } from "./anomaly.service";
import { broadcastEvent } from "./socket.service";

import config from "../config/config";

export interface LocationPayload {
  clientPointId?: string;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
  isMock?: boolean;
  recordedAt: string | Date;
}

export async function resolveEmployee(
  employeeIdOrIdentifier?: string,
  authUserId?: number | string
) {
  let employee: any = null;

  try {
    if (employeeIdOrIdentifier && typeof employeeIdOrIdentifier === "string" && employeeIdOrIdentifier.trim() !== "") {
      const trimmed = employeeIdOrIdentifier.trim();

      // 1. Try finding by primary key UUID
      try {
        employee = await prisma.employee.findUnique({
          where: { id: trimmed },
          include: {
            user: true,
            geofenceAssignments: { include: { geofence: true } },
          },
        });
      } catch {
        // Ignored if invalid UUID format
      }

      // 2. Try finding by employeeCode (e.g. EMP1001)
      if (!employee) {
        employee = await prisma.employee.findUnique({
          where: { employeeCode: trimmed },
          include: {
            user: true,
            geofenceAssignments: { include: { geofence: true } },
          },
        });
      }

      // 3. Try finding by numeric userId if identifier is a valid number
      if (!employee && !isNaN(Number(trimmed))) {
        employee = await prisma.employee.findUnique({
          where: { userId: Number(trimmed) },
          include: {
            user: true,
            geofenceAssignments: { include: { geofence: true } },
          },
        });
      }
    }

    // 4. Try resolving via authenticated user's ID
    if (!employee && authUserId && !isNaN(Number(authUserId))) {
      employee = await prisma.employee.findUnique({
        where: { userId: Number(authUserId) },
        include: {
          user: true,
          geofenceAssignments: { include: { geofence: true } },
        },
      });
    }
  } catch (err: any) {
    console.warn(`Could not resolve employee due to database connection or query error: ${err.message}`);
    return null;
  }



  // ADMIN accounts must never have employee records or tracking
  if (employee && employee.user?.role === "ADMIN") {
    return null;
  }

  return employee;
}

export async function processLocationUpdate(
  employeeId: string,
  payload: LocationPayload,
  authUserId?: number | string
) {
  const recordedAt = new Date(payload.recordedAt);
  const receivedAt = new Date();

  if (!isValidCoordinate(payload.latitude, payload.longitude)) {
    return { success: false, error: "Invalid GPS coordinates" };
  }

  // 1. Fetch employee with flexible lookup (by UUID, employeeCode, userId, or auth session)
  const employee = await resolveEmployee(employeeId, authUserId);

  if (!employee) {
    return { success: false, error: "Employee not found" };
  }

  // 2. Fetch last location for anomaly checking
  const previousLocation = employee.lastLatitude && employee.lastLongitude && employee.lastLocationUpdate
    ? {
        latitude: employee.lastLatitude,
        longitude: employee.lastLongitude,
        recordedAt: employee.lastLocationUpdate,
      }
    : null;

  const anomalyResult = checkLocationAnomaly(
    {
      latitude: payload.latitude,
      longitude: payload.longitude,
      accuracy: payload.accuracy,
      isMock: payload.isMock,
      recordedAt,
    },
    previousLocation
  );

  // 3. Save location update to database
  const locationRecord = await prisma.locationUpdate.create({
    data: {
      employeeId: employee.id,
      latitude: payload.latitude,
      longitude: payload.longitude,
      accuracyMeters: payload.accuracy,
      speed: payload.speed,
      heading: payload.heading,
      isMock: payload.isMock ?? false,
      isAnomaly: anomalyResult.isAnomaly,
      recordedAt,
      receivedAt,
    },
  });

  // 4. Update employee current coordinates
  await prisma.employee.update({
    where: { id: employee.id },
    data: {
      lastLatitude: payload.latitude,
      lastLongitude: payload.longitude,
      lastLocationUpdate: recordedAt,
    },
  });

  // 5. Evaluate against assigned geofences (with fallback to all active company geofences)
  let activeGeofences = (employee.geofenceAssignments || [])
    .filter((a: any) => a.geofence?.active)
    .map((a: any) => ({
      id: a.geofence.id,
      name: a.geofence.name,
      type: a.geofence.type,
      latitude: a.geofence.latitude,
      longitude: a.geofence.longitude,
      radiusMeters: a.geofence.radiusMeters,
    }));

  if (activeGeofences.length === 0) {
    const allActive = await prisma.geofence.findMany({
      where: { active: true },
    });
    activeGeofences = allActive.map((g) => ({
      id: g.id,
      name: g.name,
      type: g.type,
      latitude: g.latitude,
      longitude: g.longitude,
      radiusMeters: g.radiusMeters,
    }));
  }

  const currentState = stateMachine.getState(employee.id);
  const evaluation = evaluateAssignedGeofences(
    {
      latitude: payload.latitude,
      longitude: payload.longitude,
      accuracy: payload.accuracy,
    },
    activeGeofences,
    currentState.state === "INSIDE" ? currentState.geofenceId : undefined
  );

  // 6. Drive state transition machine
  const transition = stateMachine.processObservation(
    employee.id,
    evaluation.result,
    evaluation.geofenceId,
    evaluation.geofenceName,
    recordedAt.getTime(),
    evaluation.distanceMeters,
    evaluation.radiusMeters
  );

  // 7. Handle confirmed transitions (only if AUTO_GEOFENCE_ATTENDANCE is enabled)
  if (config.AUTO_GEOFENCE_ATTENDANCE) {
    if (transition.hasConfirmedEntry && transition.geofenceId && transition.geofenceName) {
      await processAttendanceOnConfirmedEntry(
        employee.id,
        transition.geofenceId,
        transition.geofenceName,
        recordedAt
      );
    } else if (transition.hasConfirmedExit) {
      await processAttendanceOnConfirmedExit(
        employee.id,
        transition.geofenceId,
        recordedAt,
        transition.geofenceName || evaluation.geofenceName
      );
    }
  }

  if (transition.newState === "INSIDE") {
    // Keep active attendance workingMinutes updated in real-time while working on-site
    const todayStr = getTodayDateString(recordedAt);
    const activeAttendance = await prisma.attendance.findUnique({
      where: {
        employeeId_workDate: {
          employeeId: employee.id,
          workDate: todayStr,
        },
      },
    });

    if (activeAttendance && activeAttendance.status === "WORKING" && activeAttendance.checkInAt) {
      const currentWorkingMins = calculateLiveWorkingMinutes(
        activeAttendance.checkInAt,
        activeAttendance.breakMinutes || 0,
        recordedAt
      );

      if (currentWorkingMins !== activeAttendance.workingMinutes) {
        await prisma.attendance.update({
          where: { id: activeAttendance.id },
          data: { workingMinutes: currentWorkingMins },
        });
      }
    }
  }

  // Handle mock location notification to admins
  if (payload.isMock) {
    try {
      const admins = await prisma.user.findMany({ where: { role: "ADMIN" } });
      for (const admin of admins) {
        await prisma.notification.create({
          data: {
            recipientUserId: admin.id,
            type: "ANOMALY",
            title: "Mock Location Detected",
            message: `Employee ${employee.user.name || employee.employeeCode} submitted a mock/spoofed GPS location (${payload.latitude}, ${payload.longitude}).`,
          },
        });
      }
      broadcastEvent("anomaly.detected", {
        employeeName: employee.user.name || employee.employeeCode,
        employeeId: employee.id,
        reason: "MOCK_LOCATION",
      });
    } catch (e) {
      console.error("[Location] Failed to notify admins of mock location:", e);
    }
  }

  // 8. Broadcast live location update to Manager Dashboard
  const broadcastPayload = {
    employeeId: employee.id,
    employeeCode: employee.employeeCode,
    name: employee.user.name || employee.user.username,
    photoUrl: employee.user.photoUrl,
    latitude: payload.latitude,
    longitude: payload.longitude,
    accuracy: payload.accuracy,
    speed: payload.speed,
    heading: payload.heading,
    state: transition.newState,
    status: employee.currentStatus,
    geofenceName: transition.geofenceName || evaluation.geofenceName,
    distanceMeters: evaluation.distanceMeters,
    isMock: Boolean(payload.isMock),
    recordedAt: recordedAt.toISOString(),
  };

  broadcastEvent("employee.location.updated", broadcastPayload);
  broadcastEvent("location.updated", broadcastPayload);

  return {
    success: true,
    employeeId: employee.id,
    employeeCode: employee.employeeCode,
    location: locationRecord,
    evaluation,
    state: transition.newState,
    anomaly: anomalyResult,
  };
}

export async function processBatchLocations(
  employeeId: string,
  updates: LocationPayload[],
  authUserId?: number | string
) {
  const employee = await resolveEmployee(employeeId, authUserId);
  if (!employee) {
    return { success: false, error: "Employee not found or admin cannot be tracked", acceptedClientPointIds: [] };
  }

  if (!Array.isArray(updates) || updates.length === 0) {
    return { success: true, processedCount: 0, acceptedClientPointIds: [] };
  }

  const nowMs = Date.now();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const receivedAt = new Date();

  // Reject points more than 1 day in the future
  const validPoints = updates.filter((u) => {
    const recMs = new Date(u.recordedAt).getTime();
    if (isNaN(recMs) || recMs > nowMs + ONE_DAY_MS) {
      return false;
    }
    return isValidCoordinate(Number(u.latitude), Number(u.longitude));
  });

  if (validPoints.length === 0) {
    return { success: true, processedCount: 0, acceptedClientPointIds: [] };
  }

  // Check for mock location flag in batch
  const hasMock = validPoints.some((p) => p.isMock);
  if (hasMock) {
    const mockPoint = validPoints.find((p) => p.isMock);
    try {
      const admins = await prisma.user.findMany({ where: { role: "ADMIN" } });
      for (const admin of admins) {
        await prisma.notification.create({
          data: {
            recipientUserId: admin.id,
            type: "ANOMALY",
            title: "Mock Location Detected in Batch",
            message: `Employee ${employee.user.name || employee.employeeCode} submitted mock/spoofed GPS data in batch upload (${mockPoint?.latitude}, ${mockPoint?.longitude}).`,
          },
        });
      }
      broadcastEvent("anomaly.detected", {
        employeeName: employee.user.name || employee.employeeCode,
        employeeId: employee.id,
        reason: "MOCK_LOCATION",
      });
    } catch (e) {
      console.error("[Location] Failed to notify admins of mock batch point:", e);
    }
  }

  // Prepare database insertion records
  const recordsToInsert = validPoints.map((p) => ({
    employeeId: employee.id,
    clientPointId: p.clientPointId || crypto.randomUUID(),
    latitude: Number(p.latitude),
    longitude: Number(p.longitude),
    accuracyMeters: p.accuracy !== undefined && p.accuracy !== null ? Number(p.accuracy) : null,
    speed: p.speed !== undefined && p.speed !== null ? Number(p.speed) : null,
    heading: p.heading !== undefined && p.heading !== null ? Number(p.heading) : null,
    isMock: Boolean(p.isMock),
    recordedAt: new Date(p.recordedAt),
    receivedAt,
  }));

  // Fast and idempotent insert with skipDuplicates
  await prisma.locationUpdate.createMany({
    data: recordsToInsert,
    skipDuplicates: true,
  });

  // Sort valid points chronologically to get the newest point
  const sorted = [...validPoints].sort(
    (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
  );
  const newest = sorted[sorted.length - 1];
  const newestRecordedAt = new Date(newest.recordedAt);

  // Update employee's last position from the newest point only
  await prisma.employee.update({
    where: { id: employee.id },
    data: {
      lastLatitude: Number(newest.latitude),
      lastLongitude: Number(newest.longitude),
      lastLocationUpdate: newestRecordedAt,
      isLocationOff: false,
    },
  });

  // Broadcast live location update for newest point
  const broadcastPayload = {
    employeeId: employee.id,
    employeeCode: employee.employeeCode,
    name: employee.user.name || employee.user.username,
    photoUrl: employee.user.photoUrl,
    latitude: Number(newest.latitude),
    longitude: Number(newest.longitude),
    accuracy: newest.accuracy,
    speed: newest.speed,
    heading: newest.heading,
    status: employee.currentStatus,
    recordedAt: newestRecordedAt.toISOString(),
  };

  broadcastEvent("employee.location.updated", broadcastPayload);
  broadcastEvent("location.updated", broadcastPayload);

  return {
    success: true,
    processedCount: recordsToInsert.length,
    acceptedClientPointIds: recordsToInsert.map((r) => r.clientPointId),
  };
}
