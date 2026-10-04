import { Router } from "express";
import { requireRole } from "../middleware/auth.middleware";
import {
  submitLocation,
  submitBatchLocations,
  getLocationHistory,
  simulateEmployeeMovement,
} from "../controllers/location.controller";

const locationRouter = Router();

locationRouter.post("/", submitLocation);
locationRouter.post("/update", submitLocation);
locationRouter.post("/batch", submitBatchLocations);
locationRouter.get("/:id/history", getLocationHistory);
// Demo/ops tool that fakes an employee's movement — never reachable by a plain employee.
locationRouter.post("/simulate", requireRole("ADMIN", "MANAGER"), simulateEmployeeMovement);

export default locationRouter;
