import { Router } from "express";
import { requireRole } from "../middleware/auth.middleware";
import {
  getEmployees,
  getEmployeeById,
  createEmployee,
  createAdminAccount,
  toggleUserActive,
  adminResetPassword,
  adminResetSessions,
  assignGeofence,
  removeGeofence,
} from "../controllers/employee.controller";

const employeeRouter = Router();

// All routes are protected by `authorized` in app.ts
// Employee roster, account creation, password resets, deactivation: ADMIN ONLY
employeeRouter.get("/", requireRole("ADMIN"), getEmployees);
employeeRouter.get("/:id", getEmployeeById);
employeeRouter.post("/", requireRole("ADMIN"), createEmployee);
employeeRouter.post("/admins", requireRole("ADMIN"), createAdminAccount);
employeeRouter.patch("/:id/status", requireRole("ADMIN"), toggleUserActive);
employeeRouter.post("/:id/deactivate", requireRole("ADMIN"), toggleUserActive);
employeeRouter.post("/:id/reset-password", requireRole("ADMIN"), adminResetPassword);
employeeRouter.post("/:id/reset-sessions", requireRole("ADMIN"), adminResetSessions);

// Geofence assignments: ADMIN ONLY
employeeRouter.post("/:id/geofences", requireRole("ADMIN"), assignGeofence);
employeeRouter.delete("/:id/geofences/:geofenceId", requireRole("ADMIN"), removeGeofence);

export default employeeRouter;
