import { Router } from "express";
import {
  getGeofences,
  createGeofence,
  updateGeofence,
  deleteGeofence,
} from "../controllers/geofence.controller";
import { authorized, requireRole } from "../middleware/auth.middleware";

const geofenceRouter = Router();

geofenceRouter.get("/", getGeofences);
geofenceRouter.post("/", authorized, requireRole("ADMIN", "MANAGER"), createGeofence);
geofenceRouter.patch("/:id", authorized, requireRole("ADMIN", "MANAGER"), updateGeofence);
geofenceRouter.delete("/:id", authorized, requireRole("ADMIN"), deleteGeofence);

export default geofenceRouter;
