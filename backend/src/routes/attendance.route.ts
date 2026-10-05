import { Router } from "express";
import { requireRole } from "../middleware/auth.middleware";
import {
  checkIn,
  checkOut,
  getAttendanceRecords,
  getAttendanceSummary,
  exportAttendanceCsv,
} from "../controllers/attendance.controller";

const attendanceRouter = Router();

// All routes protected by `authorized` in app.ts
attendanceRouter.post("/check-in", requireRole("USER"), checkIn);
attendanceRouter.post("/check-out", requireRole("USER"), checkOut);
attendanceRouter.get("/", getAttendanceRecords);
attendanceRouter.get("/summary", getAttendanceSummary);
attendanceRouter.get("/export", requireRole("ADMIN"), exportAttendanceCsv);

export default attendanceRouter;
