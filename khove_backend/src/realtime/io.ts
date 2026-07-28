import type { Server as HttpServer } from "http";
import { Server, type Socket } from "socket.io";
import { verifyToken } from "@clerk/backend";
import { db } from "@backend/lib/db";

/**
 * socket.io realtime gateway.
 *
 * - Handshake auth: the client passes a Clerk session token in `auth.token`;
 *   we verify it and resolve the Prisma userId.
 * - Rooms: every socket joins `user:{id}`. It may `join-workspace` a
 *   `workspace:{id}` room ONLY after a membership check (prevents cross-tenant
 *   event leakage — the data-integrity boundary).
 * - Emitting is done via `publishEvent` / `publishWorkspaceEvent` in
 *   `lib/realtime.ts`, which call `getIo()`.
 */

let _io: Server | null = null;

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? "http://localhost:3000";

export function initRealtime(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: { origin: FRONTEND_ORIGIN, credentials: true },
  });

  io.use(async (socket, next) => {
    try {
      const token = (socket.handshake.auth?.token ?? "") as string;
      if (!token) return next(new Error("unauthorized"));
      const payload = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY!,
        authorizedParties: [FRONTEND_ORIGIN],
      });
      const user = await db.user.findUnique({ where: { clerkId: payload.sub } });
      if (!user) return next(new Error("unauthorized"));
      socket.data.userId = user.id;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const userId = socket.data.userId as string;
    socket.join(`user:${userId}`);

    socket.on("join-workspace", async (workspaceId: unknown) => {
      if (typeof workspaceId !== "string" || !workspaceId) return;
      const membership = await db.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
      });
      if (membership) socket.join(`workspace:${workspaceId}`);
    });

    socket.on("leave-workspace", (workspaceId: unknown) => {
      if (typeof workspaceId === "string" && workspaceId) {
        socket.leave(`workspace:${workspaceId}`);
      }
    });
  });

  _io = io;
  return io;
}

export function getIo(): Server {
  if (!_io) {
    throw new Error("socket.io not initialized — call initRealtime() first");
  }
  return _io;
}
