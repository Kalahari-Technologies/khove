import { db } from "@backend/lib/db";
import { encrypt, decrypt } from "@backend/lib/encryption";

// ---------------------------------------------------------------------------
// Constants — Atlassian OAuth 2.0 (3LO) for Jira Cloud
// ---------------------------------------------------------------------------

const ATLASSIAN_CLIENT_ID = process.env.ATLASSIAN_CLIENT_ID ?? "";
const ATLASSIAN_CLIENT_SECRET = process.env.ATLASSIAN_CLIENT_SECRET ?? "";

const AUTH_BASE = "https://auth.atlassian.com";
const API_BASE = "https://api.atlassian.com";

// offline_access → refresh token; manage:jira-webhook → dynamic webhooks.
const JIRA_SCOPES = [
  "read:jira-work",
  "write:jira-work",
  "read:jira-user",
  "manage:jira-webhook",
  "offline_access",
];

// OAuth callback is hosted on the BACKEND origin (Express), not the frontend.
const JIRA_REDIRECT_URI = `${process.env.BACKEND_URL ?? "http://localhost:4000"}/api/integrations/jira/callback`;

// Refresh a little before expiry to avoid racing the clock.
const REFRESH_SKEW_MS = 2 * 60 * 1000;

// ---------------------------------------------------------------------------
// OAuth URL + token exchange
// ---------------------------------------------------------------------------

/** Authorization URL for the 3LO consent screen. State carries userId:workspaceId. */
export function createJiraOAuthUrl(state: string): string {
  const params = new URLSearchParams({
    audience: "api.atlassian.com",
    client_id: ATLASSIAN_CLIENT_ID,
    scope: JIRA_SCOPES.join(" "),
    redirect_uri: JIRA_REDIRECT_URI,
    state,
    response_type: "code",
    prompt: "consent",
  });
  return `${AUTH_BASE}/authorize?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number; // seconds
}

/** Exchange an authorization code for tokens. */
export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const res = await fetch(`${AUTH_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: ATLASSIAN_CLIENT_ID,
      client_secret: ATLASSIAN_CLIENT_SECRET,
      code,
      redirect_uri: JIRA_REDIRECT_URI,
    }),
  });
  if (!res.ok) throw new Error(`Jira token exchange failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as TokenResponse;
}

/**
 * Refresh an access token. Atlassian ROTATES refresh tokens — the response
 * carries a new refresh_token that must replace the old one immediately.
 */
export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(`${AUTH_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: ATLASSIAN_CLIENT_ID,
      client_secret: ATLASSIAN_CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`Jira token refresh failed: ${res.status} ${body}`);
    (err as { status?: number }).status = res.status;
    throw err;
  }
  return (await res.json()) as TokenResponse;
}

// ---------------------------------------------------------------------------
// Accessible resources — resolve the cloudId + site URL
// ---------------------------------------------------------------------------

export interface AccessibleResource {
  id: string; // the cloudId
  url: string; // the site URL (e.g. https://acme.atlassian.net)
  name: string;
  scopes: string[];
}

/** List the Jira sites this token can access. The first is used for the pilot. */
export async function getAccessibleResources(accessToken: string): Promise<AccessibleResource[]> {
  const res = await fetch(`${API_BASE}/oauth/token/accessible-resources`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Jira accessible-resources failed: ${res.status}`);
  return (await res.json()) as AccessibleResource[];
}

// ---------------------------------------------------------------------------
// Auth-error classification (permanent failures → deactivate + reconnect)
// ---------------------------------------------------------------------------

/**
 * True when an error is a fatal OAuth failure (revoked/expired refresh token or
 * lost consent). These are permanent — retrying is pointless; the integration
 * must be marked inactive and the user prompted to reconnect.
 */
export function isAuthError(err: unknown): boolean {
  const e = err as { message?: string; status?: number };
  const msg = String(e?.message ?? err ?? "");
  return (
    e?.status === 401 ||
    e?.status === 403 ||
    msg.includes("invalid_grant") ||
    msg.includes("unauthorized_client") ||
    msg.includes("403") ||
    msg.includes("401")
  );
}

// ---------------------------------------------------------------------------
// Access-token resolution (refresh-on-demand, persists rotated refresh token)
// ---------------------------------------------------------------------------

export interface JiraContext {
  accessToken: string;
  cloudId: string;
  siteUrl: string;
  integrationId: string;
}

/**
 * Get a valid access token + cloud context for a workspace, refreshing if the
 * stored token is near expiry. Persists the rotated refresh token. Throws (and
 * is safe to treat via isAuthError) if the integration is missing/dead.
 */
export async function getJiraContext(workspaceId: string): Promise<JiraContext> {
  const integration = await db.integration.findFirst({
    where: { workspaceId, provider: "JIRA", isActive: true },
  });
  if (!integration) throw new Error("Jira is not connected. Please connect it first.");

  const meta = (integration.metadata ?? {}) as Record<string, unknown>;
  const cloudId = meta.cloudId as string | undefined;
  const siteUrl = (meta.siteUrl as string | undefined) ?? "";
  if (!cloudId) throw new Error("Jira integration is missing its cloudId — reconnect required.");

  let accessToken = decrypt(integration.accessTokenEnc);
  const expiresAt = integration.tokenExpiresAt?.getTime() ?? 0;

  if (Date.now() >= expiresAt - REFRESH_SKEW_MS) {
    if (!integration.refreshTokenEnc) {
      throw new Error("Jira access token expired and no refresh token is stored — reconnect required.");
    }
    const refreshToken = decrypt(integration.refreshTokenEnc);
    const tokens = await refreshAccessToken(refreshToken);
    accessToken = tokens.access_token;
    await db.integration.update({
      where: { id: integration.id },
      data: {
        accessTokenEnc: encrypt(tokens.access_token),
        ...(tokens.refresh_token && { refreshTokenEnc: encrypt(tokens.refresh_token) }),
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
    });
  }

  return { accessToken, cloudId, siteUrl, integrationId: integration.id };
}

// ---------------------------------------------------------------------------
// Authenticated REST helper — Jira Cloud platform API v3
// ---------------------------------------------------------------------------

/**
 * Call the Jira Cloud REST API for a workspace (auto-refreshing the token).
 * `path` is relative to the site API root, e.g. "/rest/api/3/search".
 */
export async function jiraFetch<T = unknown>(
  workspaceId: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const { accessToken, cloudId } = await getJiraContext(workspaceId);
  const res = await fetch(`${API_BASE}/ex/jira/${cloudId}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`Jira API ${path} failed: ${res.status} ${body}`);
    (err as { status?: number }).status = res.status;
    throw err;
  }
  // Some endpoints (e.g. transitions POST) return 204 No Content.
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// ---------------------------------------------------------------------------
// ADF — Atlassian Document Format (descriptions/comments must be ADF, not text)
// ---------------------------------------------------------------------------

/** Wrap plain text in a minimal ADF document (one paragraph per line). */
export function textToADF(text: string): unknown {
  const paragraphs = text.split("\n").map((line) => ({
    type: "paragraph",
    content: line ? [{ type: "text", text: line }] : [],
  }));
  return { type: "doc", version: 1, content: paragraphs.length ? paragraphs : [{ type: "paragraph", content: [] }] };
}

// ---------------------------------------------------------------------------
// Dynamic webhooks (secret-in-URL). Expire after 30 days unless refreshed.
// ---------------------------------------------------------------------------

const WEBHOOK_EVENTS = ["jira:issue_created", "jira:issue_updated", "jira:issue_deleted"];

/** Build the receiver URL — the secret in the path is the authenticity check. */
export function jiraWebhookUrl(secret: string): string {
  return `${process.env.BACKEND_URL ?? "http://localhost:4000"}/api/webhooks/jira/${secret}`;
}

/**
 * Register a dynamic webhook scoped to the given projects. Best-effort — returns
 * the created webhook id, or null if registration fails (sync still works via
 * the poll cron).
 */
export async function registerJiraWebhook(
  workspaceId: string,
  secret: string,
  projectKeys: string[],
): Promise<{ id: number } | null> {
  if (projectKeys.length === 0) return null;
  const jqlFilter = `project in (${projectKeys.join(",")})`;
  try {
    const resp = await jiraFetch<{ webhookRegistrationResult: { createdWebhookId?: number; errors?: string[] }[] }>(
      workspaceId,
      "/rest/api/3/webhook",
      {
        method: "POST",
        body: JSON.stringify({ url: jiraWebhookUrl(secret), webhooks: [{ jqlFilter, events: WEBHOOK_EVENTS }] }),
      },
    );
    const first = resp.webhookRegistrationResult?.[0];
    return first?.createdWebhookId ? { id: first.createdWebhookId } : null;
  } catch (err) {
    console.error("[jira] webhook registration failed (non-fatal):", err);
    return null;
  }
}

/** Extend the 30-day expiry on registered webhooks. Returns the new expiry ISO. */
export async function refreshJiraWebhooks(workspaceId: string, webhookIds: number[]): Promise<string | null> {
  if (webhookIds.length === 0) return null;
  try {
    const resp = await jiraFetch<{ expirationDate?: string }>(workspaceId, "/rest/api/3/webhook/refresh", {
      method: "PUT",
      body: JSON.stringify({ webhookIds }),
    });
    return resp.expirationDate ?? null;
  } catch (err) {
    console.error("[jira] webhook refresh failed:", err);
    return null;
  }
}

/** Delete registered webhooks (on disconnect). */
export async function deleteJiraWebhooks(workspaceId: string, webhookIds: number[]): Promise<void> {
  if (webhookIds.length === 0) return;
  try {
    await jiraFetch(workspaceId, "/rest/api/3/webhook", {
      method: "DELETE",
      body: JSON.stringify({ webhookIds }),
    });
  } catch (err) {
    console.error("[jira] webhook delete failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Issue search — the new token-paginated JQL endpoint
// ---------------------------------------------------------------------------

export interface JiraIssue {
  key: string;
  fields: {
    summary?: string;
    status?: { name?: string; statusCategory?: { key?: string; name?: string } };
    project?: { key?: string; name?: string };
    issuetype?: { name?: string };
    created?: string;
    updated?: string;
  };
}

/** List the projects on the connected Jira site (for the scope picker). */
export async function listProjects(workspaceId: string): Promise<{ key: string; name: string }[]> {
  const data = await jiraFetch<{ values?: { key: string; name: string }[] }>(
    workspaceId,
    "/rest/api/3/project/search?maxResults=100",
  );
  return (data.values ?? []).map((p) => ({ key: p.key, name: p.name }));
}

/** Map Jira's statusCategory to Khove's StatusCategory. */
export function mapJiraStatusCategory(key: string | undefined): "NOT_STARTED" | "IN_PROGRESS" | "DONE" {
  if (key === "done") return "DONE";
  if (key === "indeterminate") return "IN_PROGRESS";
  return "NOT_STARTED"; // "new" / unknown
}

/**
 * Search issues by JQL (token-paginated). Fetches up to `maxPages` pages of 100.
 * Only requests the minimal fields (no personal data).
 */
export async function searchIssues(
  workspaceId: string,
  jql: string,
  maxPages = 3,
): Promise<JiraIssue[]> {
  const issues: JiraIssue[] = [];
  let nextPageToken: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const resp = await jiraFetch<{ issues?: JiraIssue[]; nextPageToken?: string; isLast?: boolean }>(
      workspaceId,
      "/rest/api/3/search/jql",
      {
        method: "POST",
        body: JSON.stringify({
          jql,
          maxResults: 100,
          fields: ["summary", "status", "project", "issuetype", "created", "updated"],
          ...(nextPageToken ? { nextPageToken } : {}),
        }),
      },
    );
    if (resp.issues?.length) issues.push(...resp.issues);
    if (resp.isLast || !resp.nextPageToken) break;
    nextPageToken = resp.nextPageToken;
  }

  return issues;
}
