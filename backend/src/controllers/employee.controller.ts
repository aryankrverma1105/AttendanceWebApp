import type { Request, Response } from "express";
import crypto from "node:crypto";
import prisma from "../config/prisma";
import { hashPassword } from "../utils/password.utils";
import { qs } from "../utils/query.utils";
import { revokeAllUserSessions } from "../services/auth.service";
import { getWorkDateIST } from "../utils/time.utils";

/**
 * Lists employees (USER accounts only). ADMIN accounts never appear here.
 */
export async function getEmployees(req: Request, res: Response) {
  try {
    const departmentId = qs(req.query.departmentId);
    const status = qs(req.query.status);
    const search = qs(req.query.search);
    const todayIST = getWorkDateIST();

    const where: any = {
      user: {
        role: "USER", // ADMIN accounts must never appear in tracked-employee list
      },
    };

    if (departmentId) where.departmentId = departmentId;
    if (status) where.currentStatus = status;
    if (search) {
      where.OR = [
        { employeeCode: { contains: search as string, mode: "insensitive" } },
        { user: { name: { contains: search as string, mode: "insensitive" } } },
        { user: { email: { contains: search as string, mode: "insensitive" } } },
      ];
    }

    const employees = await prisma.employee.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            photoUrl: true,
            role: true,
            isActive: true,
          },
        },
        department: true,
        defaultShift: true,
        geofenceAssignments: {
          include: { geofence: true },
        },
        attendances: {
          where: { workDate: todayIST },
          take: 1,
        },
        locationStatusEvents: {
          take: 1,
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Enrich with computed status flags (location-off / no-signal)
    const enriched = employees.map((emp) => {
      const activeAttendance = emp.attendances[0];
      const isCheckedIn = !!(activeAttendance && activeAttendance.checkInAt && !activeAttendance.checkOutAt);
      const isLocationOff = emp.currentStatus === "LOCATION_OFF" || emp.locationStatusEvents[0]?.state === "LOCATION_OFF";
      const isNoSignal = emp.currentStatus === "NO_SIGNAL";

      return {
        ...emp,
        activeAttendance,
        isCheckedIn,
        isLocationOff,
        isNoSignal,
      };
    });

    return res.status(200).json({ success: true, count: enriched.length, data: enriched });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Get single employee profile with detailed history.
 */
export async function getEmployeeById(req: Request, res: Response) {
  try {
    const id = req.params["id"] as string;
    const authRole = ((req as any).user?.role || "").toUpperCase();
    const authEmployeeId = (req as any).user?.employeeId;
    const isPrivileged = authRole === "ADMIN";

    if (!isPrivileged && id !== authEmployeeId) {
      return res.status(403).json({ success: false, message: "Forbidden: you can only view your own profile" });
    }

    const employee = await prisma.employee.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, email: true, name: true, photoUrl: true, role: true, isActive: true },
        },
        department: true,
        defaultShift: true,
        geofenceAssignments: {
          include: { geofence: true },
        },
        attendances: {
          orderBy: { workDate: "desc" },
          take: 30,
        },
        locationUpdates: {
          orderBy: { recordedAt: "desc" },
          take: 100,
        },
        locationStatusEvents: {
          orderBy: { at: "desc" },
          take: 20,
        },
        leaveRequests: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!employee) {
      return res.status(404).json({ success: false, message: "Employee not found" });
    }

    return res.status(200).json({ success: true, data: employee });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Create USER or ADMIN account.
 * Admin can set initial password or get an auto-generated one shown once.
 * Only USER accounts get an Employee record. ADMIN accounts NEVER get an Employee record.
 */
export async function createEmployee(req: Request, res: Response) {
  try {
    const {
      name,
      email,
      password,
      employeeCode,
      phone,
      departmentId,
      defaultShiftId,
      role = "USER",
    } = req.body;

    if (!email || !name) {
      return res.status(400).json({ success: false, message: "Name and email are required" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "User with this email already exists" });
    }

    const targetRole = String(role).toUpperCase() === "ADMIN" ? "ADMIN" : "USER";
    const tempPassword = password && String(password).trim() !== ""
      ? String(password).trim()
      : crypto.randomBytes(9).toString("base64url");
    const passwordHash = await hashPassword(tempPassword);

    const user = await prisma.user.create({
      data: {
        username: normalizedEmail.split("@")[0] + "_" + Math.floor(Math.random() * 1000),
        email: normalizedEmail,
        name,
        passwordHash,
        role: targetRole,
        isEmailVerified: true,
        isActive: true,
      },
    });

    // ADMIN accounts must NEVER have an Employee record
    if (targetRole === "ADMIN") {
      return res.status(201).json({
        success: true,
        data: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
        temporaryPassword: tempPassword,
        message: "Administrator account created successfully. Store the password safely; it is shown only once.",
      });
    }

    // USER role: provision Employee profile
    const defaultShift = defaultShiftId
      ? await prisma.shift.findUnique({ where: { id: defaultShiftId } })
      : await prisma.shift.findFirst();

    const employee = await prisma.employee.create({
      data: {
        userId: user.id,
        employeeCode: employeeCode || `EMP${Math.floor(1000 + Math.random() * 9000)}`,
        phone,
        departmentId,
        defaultShiftId: defaultShift?.id,
        currentStatus: "NOT_STARTED",
      },
      include: {
        user: { select: { id: true, email: true, name: true, role: true, isActive: true } },
        department: true,
        defaultShift: true,
      },
    });

    return res.status(201).json({
      success: true,
      data: employee,
      temporaryPassword: tempPassword,
      message: "User account created successfully. Store the password safely; it is shown only once.",
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Dedicated endpoint for creating ADMIN accounts (POST /api/admins).
 */
export async function createAdminAccount(req: Request, res: Response) {
  req.body.role = "ADMIN";
  return createEmployee(req, res);
}

export const createAdmin = createAdminAccount;

/**
 * Deactivate or activate user account. Deactivating also revokes all sessions.
 */
export async function toggleUserActive(req: Request, res: Response) {
  try {
    const id = req.params["id"] as string;
    const { isActive = false } = req.body;

    // Find user either by employeeId or directly by userId
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { employee: { id } },
          { id: !isNaN(Number(id)) ? Number(id) : -1 },
        ],
      },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { isActive: Boolean(isActive) },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });

    // If deactivating, immediately revoke all active sessions
    if (!Boolean(isActive)) {
      await revokeAllUserSessions(user.id);
    }

    return res.status(200).json({
      success: true,
      data: updated,
      message: updated.isActive ? "User account activated" : "User account deactivated and active sessions revoked",
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Admin reset password for a user. Revokes all active sessions.
 */
export async function adminResetPassword(req: Request, res: Response) {
  try {
    const id = req.params["id"] as string;
    const { newPassword } = req.body;

    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { employee: { id } },
          { id: !isNaN(Number(id)) ? Number(id) : -1 },
        ],
      },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const tempPassword = newPassword && String(newPassword).trim() !== ""
      ? String(newPassword).trim()
      : crypto.randomBytes(9).toString("base64url");
    const passwordHash = await hashPassword(tempPassword);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    // Revoke all active sessions so the old password/tokens cannot be used
    await revokeAllUserSessions(user.id);

    return res.status(200).json({
      success: true,
      temporaryPassword: tempPassword,
      message: "Password reset successfully and active sessions revoked. Share the password securely.",
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Admin reset sessions: terminates all active refresh tokens for the user.
 */
export async function adminResetSessions(req: Request, res: Response) {
  try {
    const id = req.params["id"] as string;

    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { employee: { id } },
          { id: !isNaN(Number(id)) ? Number(id) : -1 },
        ],
      },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    await revokeAllUserSessions(user.id);
    return res.status(200).json({ success: true, message: `All sessions revoked for ${user.email}` });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function assignGeofence(req: Request, res: Response) {
  try {
    const id = req.params["id"] as string;
    const { geofenceId, priority = 1, validFrom, validUntil } = req.body;

    const assignment = await prisma.employeeGeofence.upsert({
      where: {
        employeeId_geofenceId: {
          employeeId: id,
          geofenceId: geofenceId as string,
        },
      },
      update: {
        priority,
        validFrom: validFrom ? new Date(validFrom) : null,
        validUntil: validUntil ? new Date(validUntil) : null,
      },
      create: {
        employeeId: id,
        geofenceId: geofenceId as string,
        priority,
        validFrom: validFrom ? new Date(validFrom) : null,
        validUntil: validUntil ? new Date(validUntil) : null,
      },
      include: { geofence: true },
    });

    return res.status(200).json({ success: true, data: assignment });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function removeGeofence(req: Request, res: Response) {
  try {
    const id = req.params["id"] as string;
    const geofenceId = req.params["geofenceId"] as string;
    await prisma.employeeGeofence.delete({
      where: {
        employeeId_geofenceId: {
          employeeId: id,
          geofenceId,
        },
      },
    });
    return res.status(200).json({ success: true, message: "Geofence assignment removed" });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}
