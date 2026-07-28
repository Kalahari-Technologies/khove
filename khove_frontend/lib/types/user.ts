import type { User } from "@prisma/client";

export type { User };

/** Safe subset exposed to client components — no server-only fields. */
export interface ClientUser {
  id: string;
  name: string | null;
  email: string;
  planTier: string;
}
