import type { Request, Response } from "express";
import prisma from "../config/prisma";

export async function getShifts(req: Request, res: Response) {
  try {
    const shifts = await prisma.shift.findMany({
      include: {
        _count: {
          select: { employees: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return res.status(200).json({ success: true, count: shifts.length, data: shifts });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function createShift(req: Request, res: Response) {
  try {
    const { name, startTime, endTime, timezone = "Asia/Kolkata", gracePeriodMinutes = 15, overtimePolicy = "STANDARD" } = req.body;

    if (!name || !startTime || !endTime) {
      return res.status(400).json({ success: false, message: "name, startTime, and endTime are required" });
    }

    const shift = await prisma.shift.create({
      data: {
        name,
        startTime,
        endTime,
        timezone,
        gracePeriodMinutes: Number(gracePeriodMinutes),
        overtimePolicy,
        active: true,
      },
    });

    return res.status(201).json({ success: true, data: shift });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function updateShift(req: Request, res: Response) {
  try {
    const id = req.params["id"] as string;
    const { name, startTime, endTime, gracePeriodMinutes, overtimePolicy, active } = req.body;

    const data: any = {};
    if (name !== undefined) data.name = name;
    if (startTime !== undefined) data.startTime = startTime;
    if (endTime !== undefined) data.endTime = endTime;
    if (gracePeriodMinutes !== undefined) data.gracePeriodMinutes = Number(gracePeriodMinutes);
    if (overtimePolicy !== undefined) data.overtimePolicy = overtimePolicy;
    if (active !== undefined) data.active = Boolean(active);

    const shift = await prisma.shift.update({
      where: { id },
      data,
    });

    return res.status(200).json({ success: true, data: shift });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}
