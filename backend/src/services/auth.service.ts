import jwt from "jsonwebtoken";
import { config } from "../config/config";
import prisma from "../config/prisma";
import crypto from "node:crypto";

export function generateAccessToken(
  payload: { userId: number; email: string; role?: string; employeeId?: string }
) {
  const token = jwt.sign(payload, config.JWT_SECRET!, {
    expiresIn: "15m", // 15-minute access token (refreshed automatically in background)
  });
  return token;
}

export async function generateRefreshToken(
  payload: { userId: number; email: string },
  prevHash?: string,
  device?: { fingerprint?: string; ip?: string }
) {
  const token = jwt.sign(
    { ...payload, jti: crypto.randomUUID() },
    config.JWT_SECRET!,
    { expiresIn: "30d" }
  );
  const newHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  if (prevHash) {
    // Rotation (silent refresh): same device session, just extend it. The fingerprint
    // stays whatever was recorded at login — a refresh never changes which device "owns"
    // the session.
    await prisma.refreshTokens.update({
      data: {
        tokenHash: newHash,
        expiresAt,
      },
      where: {
        tokenHash: prevHash,
      },
    });
  } else {
    await prisma.refreshTokens.create({
      data: {
        userId: payload.userId,
        tokenHash: newHash,
        expiresAt,
        fingerprint: device?.fingerprint,
        ip: device?.ip,
      },
    });
  }
  return token;
}

/** Most recent still-valid session for a user, if any (used to enforce single-device login). */
export async function findActiveSession(userId: number) {
  return prisma.refreshTokens.findFirst({
    where: {
      userId,
      isRevoked: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
}

/** Revokes every active session for a user (admin escape hatch for a lost/replaced device). */
export async function revokeAllUserSessions(userId: number) {
  await prisma.refreshTokens.updateMany({
    where: { userId, isRevoked: false },
    data: { isRevoked: true, revokedAt: new Date() },
  });
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, config.JWT_SECRET!);
}

export async function rotateRefreshToken(oldRefreshToken: string) {
  try {
    jwt.verify(oldRefreshToken, config.JWT_SECRET!);
    const oldHash = crypto.createHash("sha256").update(oldRefreshToken).digest("hex");

    const record = await prisma.refreshTokens.findUnique({
      where: { tokenHash: oldHash },
      include: {
        user: {
          include: {
            employee: true,
          },
        },
      },
    });

    if (!record || record.isRevoked || record.expiresAt < new Date()) {
      return null;
    }

    const user = record.user;
    const tokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      employeeId: user.employee?.id,
    };

    const newAccessToken = generateAccessToken(tokenPayload);
    const newRefreshToken = await generateRefreshToken(
      { userId: user.id, email: user.email },
      oldHash
    );

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      user,
    };
  } catch (err) {
    console.warn("[Auth] rotateRefreshToken error:", err);
    return null;
  }
}

export async function revokeRefreshToken(token: string) {
  try {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    await prisma.refreshTokens.update({
      where: { tokenHash },
      data: { isRevoked: true, revokedAt: new Date() },
    });
  } catch {}
}