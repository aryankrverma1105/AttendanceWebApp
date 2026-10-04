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
 * Best-effort device identifier for the single-active-session policy. Clients (mobile +
 * website) send a stable per-install/per-browser `deviceId`; if one isn't supplied (older
 * client, direct API call) we fall back to a hash of IP+User-Agent, which is weaker but
 * still distinguishes "obviously a different device" from "the same client retrying".
 */
function resolveDeviceFingerprint(req: Request): string {
  const supplied = (req.body?.deviceId as string | undefined)?.trim();
  if (supplied) return supplied;
  const ua = req.headers["user-agent"] || "";
  return crypto.createHash("sha256").update(`${req.ip}|${ua}`).digest("hex");
}

/**
 * Enforces "block new device until the old one logs out": refuses the login/token-issue
 * if the user already has a live session bound to a different device fingerprint.
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
      // Bootstrap: create the very first admin account. Once it (or any other admin)
      // exists, this path never runs again for that email — an existing account is
      // never silently promoted, since that would let anyone who learns this password
      // escalate an unrelated account to ADMIN.
      const passwordHash = await hashPassword(config.SYSTEM_ADMIN_PASSWORD!);
      user = await prisma.user.create({
        data: {
          email: systemAdminEmail!,
          username: "systemadmin",
          passwordHash,
          role: "ADMIN",
          name: "System Administrator",
          isEmailVerified: true,
        },
        include: { employee: true },
      });
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

    if (!user.employee) {
      try {
        const empCode = `EMP${1000 + user.id}`;
        const defaultShift = await prisma.shift.findFirst();
        const newEmp = await prisma.employee.create({
          data: {
            userId: user.id,
            employeeCode: empCode,
            currentStatus: "WORKING",
            defaultShiftId: defaultShift?.id,
          },
        });
        user = { ...user, employee: newEmp };
      } catch (err) {
        console.warn("Could not auto-create employee record:", err);
      }
    }

    const deviceId = resolveDeviceFingerprint(req);
    const conflict = await assertNoConflictingSession(user.id, deviceId);
    if (conflict.blocked) {
      return res.status(409).json({ success: false, code: "DEVICE_CONFLICT", message: conflict.message });
    }

    const tokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      employeeId: user.employee?.id,
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = await generateRefreshToken(
      { userId: user.id, email: user.email },
      undefined,
      { fingerprint: deviceId, ip: req.ip }
    );

    return res.status(200).json({
      success: true,
      message: "Logged in successfully",
      token: accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        role: user.role,
        photoUrl: user.photoUrl,
        employeeId: user.employee?.id,
      },
    });
  } catch (error: any) {
    console.error("Login error:", error);
    return res.status(500).json({ success: false, message: error.message || "Internal server error" });
  }
}

/**
 * Quick role-switch for demos — lets an ALREADY authenticated caller preview the app as
 * another role without re-entering credentials. This mints a real token for a real
 * account, so it is only ever reachable when explicitly opted into via ALLOW_DEV_MODE
 * (checked in the route) and requires a valid JWT (checked in the route via `authorized`).
 * It never creates accounts on demand and never accepts an arbitrary target email —
 * both would turn "preview another role" into "impersonate a specific person".
 */
export async function demoLogin(req: Request, res: Response) {
  try {
    const { role = "MANAGER" } = req.body;
    const allowedRoles = ["ADMIN", "MANAGER", "EMPLOYEE"];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ success: false, message: "Invalid role" });
    }

    const user = await prisma.user.findFirst({
      where: { role },
      include: { employee: true },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: `Demo user for role ${role} not found` });
    }

    const deviceId = resolveDeviceFingerprint(req);
    const conflict = await assertNoConflictingSession(user.id, deviceId);
    if (conflict.blocked) {
      return res.status(409).json({ success: false, code: "DEVICE_CONFLICT", message: conflict.message });
    }

    const tokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      employeeId: user.employee?.id,
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
        employeeId: user.employee?.id,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

/** Revokes the refresh token for the caller's current device, freeing it up for another device to log in. */
export async function logoutUser(req: Request, res: Response) {
  try {
    const refreshToken = req.body?.refreshToken as string | undefined;
    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }
    return res.status(200).json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

/** Admin escape hatch: clears a user's active session(s) when they've lost access to their device. */
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

    return res.status(200).json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        role: user.role,
        photoUrl: user.photoUrl,
        employee: user.employee,
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
        employeeId: result.user.employee?.id,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}