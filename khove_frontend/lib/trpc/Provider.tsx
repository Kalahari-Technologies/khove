"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { useAuth } from "@clerk/nextjs";
import superjson from "superjson";
import { trpc } from "./client";
import { useWorkspace } from "@/lib/workspace/workspace-context";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

/**
 * Client-side tRPC provider. Forwards the Clerk session token (Bearer) and the
 * active `x-workspace-id` on every request to the Express backend.
 *
 * Mount INSIDE WorkspaceProvider (so `useWorkspace()` resolves) — see the
 * `[workspace]/layout.tsx` wiring finalized in Stage 5.
 */
export function TRPCProvider({ children }: { children: ReactNode }) {
  const { getToken } = useAuth();
  const workspace = useWorkspace();
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: `${BACKEND_URL}/trpc`,
          transformer: superjson,
          async headers() {
            const token = await getToken();
            return {
              ...(token ? { authorization: `Bearer ${token}` } : {}),
              ...(workspace?.id ? { "x-workspace-id": workspace.id } : {}),
            };
          },
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
