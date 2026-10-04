import { Router } from "express";
import { getAuditLogs } from "../controllers/audit.controller";
import { authorized, requireRole } from "../middleware/auth.middleware";

const auditRouter = Router();

// Audit logs are restricted to ADMIN role
auditRouter.get("/", authorized, requireRole("ADMIN"), getAuditLogs);

export default auditRouter;
