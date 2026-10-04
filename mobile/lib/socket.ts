/**
 * Shared Socket.IO connection for live updates (attendance, leave, notifications).
 *
 * Reused across screens instead of each opening its own connection — and critically,
 * dials the server's *origin*, not the REST `/api` base. Passing a URL with a path to
 * socket.io-client is interpreted as a namespace (e.g. "/api"), which the server never
 * defines, so a client connected that way never receives events emitted on the default
 * namespace ("/") the way the backend actually broadcasts them.
 */
import { io, Socket } from "socket.io-client";
import * as SecureStore from "expo-secure-store";
import { getApiBase } from "./auth";

let socket: Socket | null = null;
let connectPromise: Promise<Socket> | null = null;

function socketBaseUrl(): string {
  return getApiBase().replace(/\/api\/?$/, "");
}

async function connect(): Promise<Socket> {
  const token = await SecureStore.getItemAsync("sologix_token");
  const s = io(socketBaseUrl(), {
    auth: { token },
    transports: ["websocket"],
    reconnection: true,
    reconnectionDelay: 1500,
  });
  s.on("connect", () => console.log("[Socket.IO] mobile connected:", s.id));
  s.on("connect_error", (err) => console.warn("[Socket.IO] mobile connect error:", err.message));
  s.on("disconnect", (reason) => console.log("[Socket.IO] mobile disconnected:", reason));
  return s;
}

/** Returns the shared app-wide socket, connecting on first use. */
export async function getMobileSocket(): Promise<Socket> {
  if (socket) return socket;
  if (!connectPromise) {
    connectPromise = connect().then((s) => {
      socket = s;
      return s;
    });
  }
  return connectPromise;
}

/** Tears down the shared socket — call on logout so a stale token isn't reused. */
export function disconnectMobileSocket(): void {
  socket?.disconnect();
  socket = null;
  connectPromise = null;
}
