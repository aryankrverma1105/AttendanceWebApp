import type { Request, Response } from "express";
import prisma from "../config/prisma";
import { isValidCoordinate } from "../services/geofence.service";

export async function getGeofences(req: Request, res: Response) {
  try {
    const geofences = await prisma.geofence.findMany({
      include: {
        employeeAssignments: {
          include: {
            employee: {
              include: {
                user: {
                  select: { id: true, name: true, photoUrl: true },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({ success: true, count: geofences.length, data: geofences });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function createGeofence(req: Request, res: Response) {
  try {
    const { name, type = "OFFICE", latitude, longitude, radiusMeters = 200, address } = req.body;

    if (!name || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ success: false, message: "Name, latitude, and longitude are required" });
    }

    const lat = Number(latitude);
    const lng = Number(longitude);

    if (!isValidCoordinate(lat, lng)) {
      return res.status(400).json({ success: false, message: "Invalid latitude or longitude" });
    }

    const geofence = await prisma.geofence.create({
      data: {
        name,
        type,
        latitude: lat,
        longitude: lng,
        radiusMeters: Number(radiusMeters),
        address,
        active: true,
      },
    });

    return res.status(201).json({ success: true, data: geofence });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function updateGeofence(req: Request, res: Response) {
  try {
    const id = req.params["id"] as string;
    const { name, type, latitude, longitude, radiusMeters, address, active } = req.body;

    const data: any = {};
    if (name !== undefined) data.name = name;
    if (type !== undefined) data.type = type;
    if (latitude !== undefined) data.latitude = Number(latitude);
    if (longitude !== undefined) data.longitude = Number(longitude);
    if (radiusMeters !== undefined) data.radiusMeters = Number(radiusMeters);
    if (address !== undefined) data.address = address;
    if (active !== undefined) data.active = Boolean(active);

    const updated = await prisma.geofence.update({
      where: { id },
      data,
    });

    return res.status(200).json({ success: true, data: updated });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function deleteGeofence(req: Request, res: Response) {
  try {
    const id = req.params["id"] as string;
    await prisma.geofence.delete({ where: { id } });
    return res.status(200).json({ success: true, message: "Geofence deleted" });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}
