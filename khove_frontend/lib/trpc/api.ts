"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback } from "react";

export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

/**
 * Client-side fetch to the Express backend with the Clerk session token attached
 * as a Bearer header (and optional `x-workspace-id`). Use in client components'
 * event handlers for REST + tRPC-over-HTTP calls.
 */
export function useBackendFetch() {
  const { getToken } = useAuth();
  return useCallback(
    async (path: string, init: RequestInit = {}, workspaceId?: string) => {
      const token = await getToken();
      const headers = new Headers(init.headers);
      if (token) headers.set("authorization", `Bearer ${token}`);
      if (workspaceId) headers.set("x-workspace-id", workspaceId);
      if (init.body && !headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }
      return fetch(`${BACKEND_URL}${path}`, { ...init, headers });
    },
    [getToken]
  );
}

/**
 * Start an OAuth connect flow: authenticated fetch to the backend `connect`
 * route (returns `{ url }`), then redirect the browser to the provider.
 */
export function useConnectIntegration() {
  const backendFetch = useBackendFetch();
  return useCallback(
    async (provider: "github" | "google", workspaceId: string) => {
      const res = await backendFetch(
        `/api/integrations/${provider}/connect?workspaceId=${workspaceId}`
      );
      const data = (await res.json()) as { url?: string };
      if (data.url) window.location.href = data.url;
    },
    [backendFetch]
  );
}
