import { io, Socket } from "socket.io-client";

const getSocketUrl = (): string => {
  if (process.env.NEXT_PUBLIC_SOCKET_URL) {
    return process.env.NEXT_PUBLIC_SOCKET_URL;
  }
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:3000`;
  }
  return "http://localhost:3000";
};

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const url = getSocketUrl();
    console.log("[Socket.IO] Initializing client connection to:", url);

    socket = io(url, {
      transports: ["websocket", "polling"],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socket.on("connect", () => {
      console.log("[Socket.IO] Connected to backend server:", socket?.id);
      socket?.emit("join-dashboard", "ADMIN");
    });

    socket.on("connect_error", (err) => {
      console.warn("[Socket.IO] Connection error:", err.message);
    });

    socket.on("disconnect", (reason) => {
      console.log("[Socket.IO] Disconnected from backend server:", reason);
    });
  }

  return socket;
}
