import { Router } from "express";
import { requireRole } from "../middleware/auth.middleware";
import { getShifts, createShift, updateShift } from "../controllers/shift.controller";

const shiftRouter = Router();

// All routes protected by `authorized` in app.ts
shiftRouter.get("/", getShifts);
shiftRouter.post("/", requireRole("ADMIN", "MANAGER"), createShift);
shiftRouter.patch("/:id", requireRole("ADMIN", "MANAGER"), updateShift);

export default shiftRouter;
