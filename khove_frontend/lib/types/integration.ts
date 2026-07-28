import type { Integration } from "@prisma/client";
import { Prisma } from "@prisma/client";

export type { Integration };

/** Safe subset for client components — no token data. */
export type ClientIntegration = Prisma.IntegrationGetPayload<{
  select: {
    id: true;
    provider: true;
    isActive: true;
    metadata: true;
  };
}>;
