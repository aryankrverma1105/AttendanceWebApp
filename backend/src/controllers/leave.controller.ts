import type { Request, Response } from "express";
import prisma from "../config/prisma";
import { broadcastEvent } from "../services/socket.service";
import { qs } from "../utils/query.utils";

export async function getLeaveRequests(req: Request, res: Response) {
  try {
    const employeeId = qs(req.query.employeeId);
    const status = qs(req.query.status);

    // Same rule as attendance: an EMPLOYEE only ever sees their own leave requests.
    const authRole = ((req as any).user?.role || "").toUpperCase();
    const authEmployeeId = (req as any).user?.employeeId;
    const isPrivileged = authRole === "ADMIN";

    const where: any = {};
    if (isPrivileged) {
      if (employeeId) where.employeeId = employeeId;
    } else {
      if (!authEmployeeId) {
        return res.status(200).json({ success: true, count: 0, data: [] });
      }
      where.employeeId = authEmployeeId;
    }
    if (status) where.status = status;

    const leaves = await prisma.leaveRequest.findMany({
      where,
      include: {
        employee: {
          include: {
            user: {
              select: { id: true, name: true, email: true, photoUrl: true },
            },
            department: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({ success: true, count: leaves.length, data: leaves });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function createLeaveRequest(req: Request, res: Response) {
  try {
    const { employeeId, startDate, endDate, leaveType = "CASUAL", reason } = req.body;

    const authRole = ((req as any).user?.role || "").toUpperCase();
    const authEmployeeId = (req as any).user?.employeeId;
    const isPrivileged = authRole === "ADMIN";
    const targetEmployeeId = isPrivileged ? employeeId || authEmployeeId : authEmployeeId;

    if (!targetEmployeeId || !startDate || !endDate) {
      return res.status(400).json({ success: false, message: "employeeId, startDate, and endDate are required" });
    }

    const leave = await prisma.leaveRequest.create({
      data: {
        employeeId: targetEmployeeId,
        startDate,
        endDate,
        leaveType,
        reason,
        status: "PENDING",
      },
      include: {
        employee: { include: { user: true } },
      },
    });

    broadcastEvent("notification.new", {
      type: "LEAVE_REQUESTED",
      title: "New Leave Application",
      message: `${leave.employee.user.name || leave.employee.employeeCode} requested ${leaveType} leave from ${startDate} to ${endDate}.`,
    });

    return res.status(201).json({ success: true, data: leave });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

/** The approver's identity for the audit trail always comes from their token, never the request body. */
async function resolveApproverName(req: Request): Promise<string> {
  const authUserId = (req as any).user?.userId;
  const authEmail = (req as any).user?.email;
  if (authUserId) {
    const approver = await prisma.user.findUnique({ where: { id: authUserId }, select: { name: true, email: true } });
    if (approver) return approver.name || approver.email;
  }
  return authEmail || "Manager";
}

export async function approveLeaveRequest(req: Request, res: Response) {
  try {
    const id = req.params["id"] as string;
    const approvedBy = await resolveApproverName(req);

    const leave = await prisma.leaveRequest.update({
      where: { id },
      data: {
        status: "APPROVED",
        approvedBy,
      },
      include: {
        employee: { include: { user: true } },
      },
    }) as any;

    // Notify employee
    await prisma.notification.create({
      data: {
        recipientUserId: leave.employee.userId,
        type: "LEAVE_APPROVED",
        title: "Leave Request Approved",
        message: `Your ${leave.leaveType} leave request for ${leave.startDate} to ${leave.endDate} was approved by ${approvedBy}.`,
      },
    });

    broadcastEvent("leave.updated", {
      id: leave.id,
      employeeId: leave.employeeId,
      status: "APPROVED",
    });

    return res.status(200).json({ success: true, data: leave });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function rejectLeaveRequest(req: Request, res: Response) {
  try {
    const id = req.params["id"] as string;
    const approvedBy = await resolveApproverName(req);

    const leave = await prisma.leaveRequest.update({
      where: { id },
      data: {
        status: "REJECTED",
        approvedBy,
      },
      include: {
        employee: { include: { user: true } },
      },
    }) as any;

    // Notify employee
    await prisma.notification.create({
      data: {
        recipientUserId: leave.employee.userId,
        type: "LEAVE_REJECTED",
        title: "Leave Request Declined",
        message: `Your ${leave.leaveType} leave request for ${leave.startDate} to ${leave.endDate} was not approved.`,
      },
    });

    broadcastEvent("leave.updated", {
      id: leave.id,
      employeeId: leave.employeeId,
      status: "REJECTED",
    });

    return res.status(200).json({ success: true, data: leave });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}
