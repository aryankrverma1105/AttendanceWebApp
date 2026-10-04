import type { Request, Response } from "express";
import prisma from "../config/prisma";

export async function getNotifications(req: Request, res: Response) {
  try {
    const notifications = await prisma.notification.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return res.status(200).json({ success: true, count: notifications.length, data: notifications });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function markNotificationRead(req: Request, res: Response) {
  try {
    const id = req.params["id"] as string;
    const notification = await prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
    return res.status(200).json({ success: true, data: notification });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}
