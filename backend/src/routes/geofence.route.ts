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
geofenceRouter.post("/", authorized, requireRole("ADMIN"), createGeofence);
geofenceRouter.patch("/:id", authorized, requireRole("ADMIN"), updateGeofence);
geofenceRouter.delete("/:id", authorized, requireRole("ADMIN"), deleteGeofence);

export default geofenceRouter;
