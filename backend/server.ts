/**
 * Sologix Energy - Attendance & Workforce Operations Server
 * Made by Aryan Kumar Verma
 * All rights reserved © 2026 Sologix Energy
 */
import http from "node:http";
import app from "./src/app";
import prisma from "./src/config/prisma";
import { initSocketServer } from "./src/services/socket.service";

const PORT = Number(process.env.PORT) || 3000;

async function initialize() {
  try {
    await prisma.$connect();
    console.log("[DB] Connected to PostgreSQL via Prisma");

    const httpServer = http.createServer(app);
    initSocketServer(httpServer);
    console.log("[Socket.IO] Realtime server initialized");

    httpServer.listen(PORT, () => {
      console.log(`[Sologix Server] API & Sockets running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("[Fatal] Failed to initialize server:", err);
    process.exit(1);
  }
}

initialize();