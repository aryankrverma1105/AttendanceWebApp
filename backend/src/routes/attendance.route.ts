import { Router } from "express";
import { requireRole } from "../middleware/auth.middleware";
import {
  getAttendanceRecords,
  getAttendanceSummary,
  exportAttendanceCsv,
} from "../controllers/attendance.controller";

const attendanceRouter = Router();

// All routes protected by `authorized` in app.ts
attendanceRouter.get("/", getAttendanceRecords);
attendanceRouter.get("/summary", getAttendanceSummary);
attendanceRouter.get("/export", requireRole("ADMIN", "MANAGER"), exportAttendanceCsv);

export default attendanceRouter;
