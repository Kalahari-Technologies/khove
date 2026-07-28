"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { io } from "socket.io-client";
import { useWorkspace } from "@/lib/workspace/workspace-context";

const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ??
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "http://localhost:4000";

/**
 * Connects to the backend socket.io gateway and calls router.refresh() on any
 * "realtime" event — re-running the current page's server components (which now
 * fetch from the backend) without a full navigation.
 *
 * The handshake is authenticated with a fresh Clerk token; on connect we join
 * the active workspace room (server verifies membership before joining).
 */
export function useRealtime() {
  const router = useRouter();
  const { getToken } = useAuth();
  const workspace = useWorkspace();
  const workspaceId = workspace?.id;

  useEffect(() => {
    const socket = io(WS_URL, {
      withCredentials: true,
      auth: (cb) => {
        getToken().then((token) => cb({ token: token ?? "" }));
      },
    });

    socket.on("connect", () => {
      if (workspaceId) socket.emit("join-workspace", workspaceId);
    });
    socket.on("realtime", () => router.refresh());

    return () => {
      socket.disconnect();
    };
  }, [router, getToken, workspaceId]);
}
