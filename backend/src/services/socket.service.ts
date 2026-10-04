import { Server as SocketIOServer } from "socket.io";
import type { Server as HTTPServer } from "node:http";

let io: SocketIOServer | null = null;

export function initSocketServer(httpServer: HTTPServer) {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*", // allow Next.js dashboard, Expo web/mobile
      methods: ["GET", "POST", "PATCH"],
    },
  });

  io.on("connection", (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);

    socket.on("join-dashboard", (role) => {
      socket.join("dashboard");
      console.log(`[Socket.IO] ${socket.id} joined dashboard room (${role})`);
    });

    socket.on("disconnect", () => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
    });
  });

  return io;
}

export function getSocketServer(): SocketIOServer | null {
  return io;
}

export function broadcastEvent(eventName: string, payload: any) {
  if (!io) {
    return;
  }
  // Emit to all clients and dashboard room
  io.emit(eventName, payload);
}
