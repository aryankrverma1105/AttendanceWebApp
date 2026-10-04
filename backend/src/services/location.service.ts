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

export interface LocationPayload {
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

    // 5. If user exists but employee profile has not been created, auto-provision it
    if (!employee) {
      const user = await prisma.user.findUnique({
        where: { id: Number(authUserId) },
      });
      if (user) {
        const empCode = `EMP${1000 + user.id}`;
        const defaultShift = await prisma.shift.findFirst();
        employee = await prisma.employee.create({
          data: {
            userId: user.id,
            employeeCode: empCode,
            currentStatus: "WORKING",
            defaultShiftId: defaultShift?.id,
          },
          include: {
            user: true,
            geofenceAssignments: { include: { geofence: true } },
          },
        });
        console.log(`[Location] Auto-provisioned employee ${empCode} for authenticated user ${user.id}`);
      }
    }
  }

  // 6. Ultimate fallback: if only 1 employee exists in database (single tenant / admin user demo)
  if (!employee) {
    const totalCount = await prisma.employee.count();
    if (totalCount === 1) {
      employee = await prisma.employee.findFirst({
        include: {
          user: true,
          geofenceAssignments: { include: { geofence: true } },
        },
      });
    }
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

  // 7. Handle confirmed transitions
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
  } else if (transition.newState === "INSIDE") {
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
  const results = [];
  // Sort updates chronologically by recordedAt
  const sorted = [...updates].sort(
    (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
  );

  for (const item of sorted) {
    const res = await processLocationUpdate(employeeId, item, authUserId);
    results.push(res);
  }

  return {
    processedCount: results.length,
    latestState: results[results.length - 1]?.state,
  };
}
