import type { Request, Response } from "express";
import crypto from "node:crypto";
import prisma from "../config/prisma";
import { hashPassword } from "../utils/password.utils";
import { qs } from "../utils/query.utils";

export async function getEmployees(req: Request, res: Response) {
  try {
    const departmentId = qs(req.query.departmentId);
    const status = qs(req.query.status);
    const search = qs(req.query.search);
    const where: any = {};
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
          },
        },
        department: true,
        defaultShift: true,
        geofenceAssignments: {
          include: { geofence: true },
        },
        attendances: {
          take: 1,
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({ success: true, count: employees.length, data: employees });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function getEmployeeById(req: Request, res: Response) {
  try {
    const id = req.params["id"] as string;
    const authRole = ((req as any).user?.role || "").toUpperCase();
    const authEmployeeId = (req as any).user?.employeeId;
    const isPrivileged = authRole === "ADMIN" || authRole === "MANAGER";
    if (!isPrivileged && id !== authEmployeeId) {
      return res.status(403).json({ success: false, message: "Forbidden: you can only view your own profile" });
    }

    const employee = await prisma.employee.findUnique({
      where: { id },
      include: {
        user: true,
        department: true,
        defaultShift: true,
        geofenceAssignments: {
          include: { geofence: true },
        },
        attendances: {
          orderBy: { workDate: "desc" },
          take: 15,
        },
        locationUpdates: {
          orderBy: { recordedAt: "desc" },
          take: 50,
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

export async function createEmployee(req: Request, res: Response) {
  try {
    const { name, email, employeeCode, phone, departmentId, defaultShiftId, role = "EMPLOYEE" } = req.body;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "User with this email already exists" });
    }

    // Only an ADMIN may hand out ADMIN/MANAGER accounts through this endpoint — a MANAGER
    // creating "employees" must not be able to mint themselves peers or superiors.
    const authRole = ((req as any).user?.role || "").toUpperCase();
    const requestedRole = String(role).toUpperCase();
    const finalRole = authRole === "ADMIN" && ["ADMIN", "MANAGER", "EMPLOYEE"].includes(requestedRole)
      ? requestedRole
      : "EMPLOYEE";

    // Every account needs a real, unguessable starting password — a fixed default would
    // mean anyone who reads the source (or the docs) has a working password for every
    // employee until they change it.
    const tempPassword = crypto.randomBytes(9).toString("base64url");
    const passwordHash = await hashPassword(tempPassword);

    const user = await prisma.user.create({
      data: {
        username: email.split("@")[0] + "_" + Math.floor(Math.random() * 1000),
        email,
        name,
        passwordHash,
        role: finalRole as any,
        isEmailVerified: true,
      },
    });

    const employee = await prisma.employee.create({
      data: {
        userId: user.id,
        employeeCode: employeeCode || `EMP${Math.floor(100 + Math.random() * 900)}`,
        phone,
        departmentId,
        defaultShiftId,
        currentStatus: "NOT_STARTED",
      },
      include: { user: true, department: true, defaultShift: true },
    });

    // Returned once, out of band from any log — the creating admin/manager is responsible
    // for sharing it securely with the new employee.
    return res.status(201).json({ success: true, data: employee, temporaryPassword: tempPassword });
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
