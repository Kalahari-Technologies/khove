import type { Subscription } from "@prisma/client";
import { Prisma } from "@prisma/client";

export type { Subscription };

/** Safe subset for client — no billing provider or external IDs. */
export type ClientSubscription = Prisma.SubscriptionGetPayload<{
  select: {
    tier: true;
    status: true;
    currentPeriodEnd: true;
    trialEnd: true;
  };
}>;
