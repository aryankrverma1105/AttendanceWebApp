import { Router } from "express";
import { requireRole } from "../middleware/auth.middleware";
import {
  getLeaveRequests,
  createLeaveRequest,
  approveLeaveRequest,
  rejectLeaveRequest,
} from "../controllers/leave.controller";

const leaveRouter = Router();

// All routes protected by `authorized` in app.ts
leaveRouter.get("/", getLeaveRequests);
leaveRouter.post("/", createLeaveRequest);
leaveRouter.post("/:id/approve", requireRole("ADMIN", "MANAGER"), approveLeaveRequest);
leaveRouter.post("/:id/reject", requireRole("ADMIN", "MANAGER"), rejectLeaveRequest);

export default leaveRouter;
