import crypto from "node:crypto";
import { redis } from "@backend/lib/redis";

/**
 * OAuth `state` handling for provider connect flows.
 *
 * The OAuth callback is a top-level browser redirect from the provider to the
 * BACKEND origin — it carries no Clerk session (the session lives on the frontend
 * origin). So identity cannot be read from the request at the callback. Instead,
 * the authenticated `/connect` route (which HAS the session) stashes the caller's
 * identity in Redis under a random, single-use `state` nonce; the callback looks
 * it up. This also gives real CSRF protection (a forged callback has no matching
 * state), replacing the old forgeable plaintext `userId:workspaceId` state.
 */

export interface OAuthState {
  userId: string;
  workspaceId: string;
}

const TTL_SECONDS = 600; // 10 minutes to complete consent

/** Create a single-use state nonce and store the identity behind it. */
export async function createOAuthState(
  provider: string,
  data: OAuthState
): Promise<string> {
  const state = crypto.randomBytes(24).toString("hex");
  await redis.set(`oauth-state:${provider}:${state}`, JSON.stringify(data), {
    ex: TTL_SECONDS,
  });
  return state;
}

/** Read + delete (single-use) a state nonce. Null if unknown/expired/malformed. */
export async function consumeOAuthState(
  provider: string,
  state: string | undefined
): Promise<OAuthState | null> {
  if (!state) return null;
  const key = `oauth-state:${provider}:${state}`;
  const raw = await redis.get<string | OAuthState>(key);
  if (!raw) return null;
  await redis.del(key); // single-use
  const data = typeof raw === "string" ? (JSON.parse(raw) as OAuthState) : raw;
  if (!data?.userId || !data?.workspaceId) return null;
  return data;
}
