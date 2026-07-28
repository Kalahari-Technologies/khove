import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@backend/server/routers/_app";

/**
 * Typed tRPC React client. `AppRouter` is imported as a TYPE ONLY from the
 * backend workspace — no backend runtime code is bundled into the frontend.
 * Consumed by the Provider (client components) and the server caller (RSC).
 */
export const trpc = createTRPCReact<AppRouter>();
