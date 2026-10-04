import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../services/auth.service";
import { config } from "../config/config";

/** Both gates must hold: never rely on NODE_ENV alone, since a misconfigured deployment
 *  that forgets to set NODE_ENV=production would otherwise silently reopen this bypass. */
const DEV_BYPASS_ENABLED = process.env.NODE_ENV !== "production" && config.ALLOW_DEV_MODE;

/**
 * Middleware that validates the Bearer JWT token.
 * With ALLOW_DEV_MODE=true (and outside production), falls back to `x-user-role` header
 * for development convenience. Otherwise requires a valid JWT.
 */
export const authorized = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;

    if (token) {
      // Always prefer a real JWT when present
      try {
        const decoded = verifyAccessToken(token);
        (req as any).user = decoded;
        return next();
      } catch {
        return res.status(401).json({ success: false, error: "Unauthorized: Invalid or expired token" });
      }
    }

    if (DEV_BYPASS_ENABLED) {
      const demoRole = (req.headers["x-user-role"] as string | undefined)?.toUpperCase();
      const validRoles = ["ADMIN", "MANAGER", "EMPLOYEE"];
      if (demoRole && validRoles.includes(demoRole)) {
        (req as any).user = { userId: "demo-user", role: demoRole };
        return next();
      }
    }

    return res.status(401).json({ success: false, error: "Unauthorized: Token missing" });
  } catch (error) {
    return res.status(401).json({ success: false, error: "Unauthorized: Authentication failed" });
  }
};

/**
 * Middleware factory: ensures the authenticated user has one of the specified roles.
 * Must be used after `authorized`.
 */
export const requireRole = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ success: false, error: "Unauthorized: Please log in" });
    }
    const userRole = (user.role ?? "").toUpperCase();
    const allowed = roles.map((r) => r.toUpperCase());
    if (!allowed.includes(userRole)) {
      return res.status(403).json({
        success: false,
        error: `Forbidden: This action requires one of [${roles.join(", ")}] role(s)`,
      });
    }
    return next();
  };
};