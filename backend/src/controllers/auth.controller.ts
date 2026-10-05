import type { Request, Response } from "express";
import prisma from "../config/prisma";
import crypto from "node:crypto";
import { comparePassword, hashPassword } from "../utils/password.utils";
import { config } from "../config/config";
import {
  generateAccessToken,
  generateRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserSessions,
  findActiveSession,
} from "../services/auth.service";

/**
 * Best-effort device identifier for the single-active-session policy.
 */
function resolveDeviceFingerprint(req: Request): string {
  const supplied = (req.body?.deviceId as string | undefined)?.trim();
  if (supplied) return supplied;
  const ua = req.headers["user-agent"] || "";
  return crypto.createHash("sha256").update(`${req.ip}|${ua}`).digest("hex");
}

/**
 * Enforces "block new device until the old one logs out".
 */
async function assertNoConflictingSession(userId: number, fingerprint: string) {
  const active = await findActiveSession(userId);
  if (active && active.fingerprint && active.fingerprint !== fingerprint) {
    return {
      blocked: true as const,
      message:
        "This account is already signed in on another device. Log out there first, or ask an admin to reset your session.",
    };
  }
  return { blocked: false as const };
}

export async function loginUser(req: Request, res: Response) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const systemAdminEmail = config.SYSTEM_ADMIN?.trim().toLowerCase();
    const canBootstrapAdmin = !!systemAdminEmail && !!config.SYSTEM_ADMIN_PASSWORD;
    const isSystemAdminLogin =
      canBootstrapAdmin &&
      normalizedEmail === systemAdminEmail &&
      password === config.SYSTEM_ADMIN_PASSWORD;

    let user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { employee: true },
    });

    if (isSystemAdminLogin && !user) {
      // Bootstrap: create the very first admin account
      const passwordHash = await hashPassword(config.SYSTEM_ADMIN_PASSWORD!);
      user = await prisma.user.create({
        data: {
          email: systemAdminEmail!,
          username: "systemadmin",
          passwordHash,
          role: "ADMIN",
          name: "System Administrator",
          isEmailVerified: true,
          isActive: true,
        },
        include: { employee: true },
      });
      console.log("[Bootstrap] Created initial SYSTEM_ADMIN account:", systemAdminEmail);
    } else {
      if (!user) {
        return res.status(401).json({ success: false, message: "Invalid email or password" });
      }

      const passwordMatch = await comparePassword(password, user.passwordHash);
      if (!passwordMatch) {
        return res.status(401).json({ success: false, message: "Invalid email or password" });
      }
    }

    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    // Block deactivated accounts from logging in
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account has been deactivated. Please contact your administrator.",
      });
    }

    // NOTE: Auto-creation of Employee record at login has been completely REMOVED.
    // Only USER accounts get an Employee record, created explicitly by an ADMIN.
    // ADMIN accounts never get an employee record, attendance, or tracking.

    const deviceId = resolveDeviceFingerprint(req);
    const conflict = await assertNoConflictingSession(user.id, deviceId);
    if (conflict.blocked) {
      return res.status(409).json({ success: false, code: "DEVICE_CONFLICT", message: conflict.message });
    }

    const tokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      employeeId: user.role === "USER" ? user.employee?.id : undefined,
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = await generateRefreshToken(
      { userId: user.id, email: user.email },
      undefined,
      { fingerprint: deviceId, ip: req.ip }
    );

    return res.status(200).json({
      success: true,
      token: accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        role: user.role,
        photoUrl: user.photoUrl,
        employeeId: user.role === "USER" ? user.employee?.id : undefined,
      },
    });
  } catch (error: any) {
    console.error("Login error:", error);
    return res.status(500).json({ success: false, message: error.message || "Internal server error" });
  }
}

/** Revokes the refresh token for the caller's current device. */
export async function logoutUser(req: Request, res: Response) {
  try {
    const refreshToken = req.body?.refreshToken as string | undefined;
    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }
    return res.status(200).json({ success: true, message: "Logged out successfully" });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

/** Admin escape hatch: clears a user's active session(s). */
export async function adminResetUserSessions(req: Request, res: Response) {
  try {
    const userId = Number(req.params["userId"]);
    if (!Number.isFinite(userId)) {
      return res.status(400).json({ success: false, message: "Invalid userId" });
    }
    await revokeAllUserSessions(userId);
    return res.status(200).json({ success: true, message: "Sessions cleared" });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function getCurrentUser(req: Request, res: Response) {
  try {
    const userPayload = (req as any).user;
    if (!userPayload?.userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userPayload.userId },
      include: {
        employee: {
          include: {
            defaultShift: true,
            geofenceAssignments: { include: { geofence: true } },
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: "Account deactivated" });
    }

    return res.status(200).json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        role: user.role,
        photoUrl: user.photoUrl,
        employee: user.role === "USER" ? user.employee : null,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function refreshSession(req: Request, res: Response) {
  try {
    const refreshToken = req.body?.refreshToken || (req.headers["x-refresh-token"] as string);
    if (!refreshToken) {
      return res.status(400).json({ success: false, message: "Refresh token is required" });
    }

    const result = await rotateRefreshToken(refreshToken);
    if (!result) {
      return res.status(401).json({ success: false, message: "Invalid or expired refresh token" });
    }

    if (!result.user.isActive) {
      return res.status(403).json({ success: false, message: "Account has been deactivated" });
    }

    return res.status(200).json({
      success: true,
      token: result.accessToken,
      refreshToken: result.refreshToken,
      user: {
        id: result.user.id,
        username: result.user.username,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
        photoUrl: result.user.photoUrl,
        employeeId: result.user.role === "USER" ? result.user.employee?.id : undefined,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}