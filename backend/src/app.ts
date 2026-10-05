import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import { config } from "./config/config";
import { authorized } from "./middleware/auth.middleware";
import authRouter from "./routes/auth.route";
import userRoute from "./routes/user.route";
import employeeRouter from "./routes/employee.route";
import geofenceRouter from "./routes/geofence.route";
import locationRouter from "./routes/location.route";
import attendanceRouter from "./routes/attendance.route";
import shiftRouter from "./routes/shift.route";
import leaveRouter from "./routes/leave.route";
import analyticsRouter from "./routes/analytics.route";
import auditRouter from "./routes/audit.route";
import notificationRouter from "./routes/notification.route";

const app = express();

// ─── CORS ───────────────────────────────────────────────────────────────────
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
  "http://localhost:8081",
  ...(process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
    : []),
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no Origin header (mobile apps, Postman, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-request-id",
    ],
  }),
);

// ─── Security Headers ────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

// ─── Parsers ─────────────────────────────────────────────────────────────────
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

import prisma from "./config/prisma";

// ─── Health Check ────────────────────────────────────────────────────────────
app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      status: "ok",
      database: "connected",
      timestamp: new Date().toISOString(),
      service: "Sologix Attendance API",
    });
  } catch (err: any) {
    res.status(503).json({
      status: "degraded",
      database: "disconnected",
      error: err.message,
      timestamp: new Date().toISOString(),
      service: "Sologix Attendance API",
    });
  }
});

// ─── Public Routes (no auth required) ────────────────────────────────────────
app.use("/api/auth", authRouter);

import { createAdmin } from "./controllers/employee.controller";
import { requireRole } from "./middleware/auth.middleware";

// ─── Protected Routes (JWT required) ─────────────────────────────────────────
app.use("/api/users", authorized, userRoute);
app.use("/api/employees", authorized, employeeRouter);
app.post("/api/admins", authorized, requireRole("ADMIN"), createAdmin);
app.use("/api/geofences", authorized, geofenceRouter);
app.use("/api/location", authorized, locationRouter);
app.use("/api/attendance", authorized, attendanceRouter);
app.use("/api/shifts", authorized, shiftRouter);
app.use("/api/leaves", authorized, leaveRouter);
app.use("/api/analytics", authorized, analyticsRouter);
app.use("/api/audit-logs", authorized, auditRouter);
app.use("/api/notifications", authorized, notificationRouter);

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const status = err.status ?? 500;
    const message =
      process.env.NODE_ENV === "production" && status === 500
        ? "An unexpected error occurred"
        : (err.message ?? "Unknown error");
    console.error(`[ERROR]:`, err);
    res.status(status).json({ success: false, error: message });
  },
);

export default app;
