import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { auth } from "@clerk/nextjs/server";
import superjson from "superjson";
import type { AppRouter } from "@backend/server/routers/_app";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

/**
 * Server-side (RSC) tRPC client. Forwards a fresh Clerk session token per
 * request via `auth().getToken()` (short-lived — never cache) plus the active
 * `x-workspace-id`. Use in Server Components to fetch from the Express backend.
 *
 * Example: `const trpc = await serverTRPC(workspace.id); const t = await trpc.task.list.query()`.
 */
export async function serverTRPC(workspaceId?: string) {
  const { getToken } = await auth();
  const token = await getToken();

  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${BACKEND_URL}/trpc`,
        transformer: superjson,
        headers() {
          return {
            ...(token ? { authorization: `Bearer ${token}` } : {}),
            ...(workspaceId ? { "x-workspace-id": workspaceId } : {}),
          };
        },
      }),
    ],
  });
}
