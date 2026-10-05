import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../services/auth.service";

/**
 * Middleware that validates the Bearer JWT access token.
 * All requests must supply a valid JWT signed with JWT_SECRET.
 */
export const authorized = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;

    if (!token) {
      return res.status(401).json({ success: false, error: "Unauthorized: Token missing" });
    }

    try {
      const decoded = verifyAccessToken(token);
      (req as any).user = decoded;
      return next();
    } catch {
      return res.status(401).json({ success: false, error: "Unauthorized: Invalid or expired token" });
    }
  } catch (error) {
    return res.status(401).json({ success: false, error: "Unauthorized: Authentication failed" });
  }
};

/**
 * Middleware factory: ensures the authenticated user has one of the specified roles (ADMIN or USER).
 * Must be used after `authorized`.
 */
export const requireRole = (...roles: (string | string[])[]) => {
  const flatRoles = roles.flat().map((r) => String(r).toUpperCase());
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ success: false, error: "Unauthorized: Please log in" });
    }
    const userRole = (user.role ?? "").toUpperCase();
    if (!flatRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: `Access denied: Requires role ${flatRoles.join(", ")}`,
        error: `Forbidden: This action requires one of [${flatRoles.join(", ")}] role(s)`,
      });
    }
    return next();
  };
};