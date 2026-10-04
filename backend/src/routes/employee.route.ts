import { Router } from "express";
import { requireRole } from "../middleware/auth.middleware";
import {
  getEmployees,
  getEmployeeById,
  createEmployee,
  assignGeofence,
  removeGeofence,
} from "../controllers/employee.controller";

const employeeRouter = Router();

// All routes are already protected by `authorized` in app.ts
// Full roster (with contact info) is a management view — a plain employee has no reason
// to enumerate coworkers. Single-record lookup stays open; the controller itself only
// allows viewing your own record unless you're ADMIN/MANAGER.
employeeRouter.get("/", requireRole("ADMIN", "MANAGER"), getEmployees);
employeeRouter.get("/:id", getEmployeeById);
employeeRouter.post("/", requireRole("ADMIN", "MANAGER"), createEmployee);
employeeRouter.post("/:id/geofences", requireRole("ADMIN", "MANAGER"), assignGeofence);
employeeRouter.delete("/:id/geofences/:geofenceId", requireRole("ADMIN", "MANAGER"), removeGeofence);

export default employeeRouter;
