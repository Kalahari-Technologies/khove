import { Octokit } from "@octokit/rest";
import { App } from "@octokit/app";
import { db } from "@backend/lib/db";
import { encrypt, decrypt } from "@backend/lib/encryption";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID!;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET!;
const GITHUB_APP_ID = process.env.GITHUB_APP_ID!;
const GITHUB_APP_PRIVATE_KEY = (process.env.GITHUB_APP_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
// The App's URL slug (github.com/apps/<slug>) — used to build the install URL.
const GITHUB_APP_SLUG = process.env.GITHUB_APP_SLUG ?? "";

const GITHUB_OAUTH_SCOPES = ["read:user", "user:email", "repo"];
// OAuth callback is hosted on the BACKEND origin (Express), not the frontend.
const GITHUB_REDIRECT_URI = `${process.env.BACKEND_URL ?? "http://localhost:4000"}/api/integrations/github/callback`;

// ---------------------------------------------------------------------------
// OAuth URL generation
// ---------------------------------------------------------------------------

/**
 * Generate GitHub OAuth authorization URL.
 * State parameter encodes userId:workspaceId for CSRF validation in callback.
 */
export function createGitHubOAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: GITHUB_REDIRECT_URI,
    scope: GITHUB_OAUTH_SCOPES.join(" "),
    state,
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

/**
 * Generate the GitHub App INSTALL URL (install + authorize in one step).
 * With "Request user authorization (OAuth) during installation" enabled on the
 * App, GitHub redirects back to the OAuth callback with BOTH `code` (user
 * identity) and `installation_id` (the bot install) — so the Shepherd can act
 * as the app on every installed repo, regardless of who triggers an event.
 */
export function createGitHubInstallUrl(state: string): string {
  const params = new URLSearchParams({ state });
  return `https://github.com/apps/${GITHUB_APP_SLUG}/installations/new?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// OAuth token exchange
// ---------------------------------------------------------------------------

/**
 * Exchange OAuth authorization code for an access token.
 */
export async function exchangeCodeForToken(code: string): Promise<{
  accessToken: string;
  tokenType: string;
  scope: string;
}> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code,
    }),
  });

  const data = await res.json();

  if (data.error) {
    throw new Error(`GitHub OAuth error: ${data.error_description ?? data.error}`);
  }

  return {
    accessToken: data.access_token,
    tokenType: data.token_type,
    scope: data.scope,
  };
}

// ---------------------------------------------------------------------------
// Authenticated client
// ---------------------------------------------------------------------------

/**
 * Get an authenticated Octokit client for a user.
 * Reads the encrypted token from the Integration record.
 */
export async function getGitHubClient(workspaceId: string): Promise<Octokit> {
  const integration = await db.integration.findFirst({
    where: { workspaceId, provider: "GITHUB", isActive: true },
  });

  if (!integration) {
    throw new Error("GitHub is not connected");
  }

  const accessToken = decrypt(integration.accessTokenEnc);
  return new Octokit({ auth: accessToken });
}

/**
 * Get an installation-scoped Octokit client.
 * Uses the GitHub App private key to generate an installation token.
 * ALWAYS check installationId exists before calling this.
 */
// Build the App with a FULL Octokit (rest endpoint methods + paginate). The
// default @octokit/app Octokit lacks the paginate plugin, so installation clients
// created from it throw on octokit.paginate(...) / some rest helpers — which is why
// repo listing silently fell back to the user's personal repos.
function makeApp() {
  return new App({
    appId: GITHUB_APP_ID,
    privateKey: GITHUB_APP_PRIVATE_KEY,
    Octokit,
  });
}

export async function getInstallationClient(installationId: number) {
  return makeApp().getInstallationOctokit(installationId);
}

/**
 * The account (org or user) an installation is installed ON — this is the identity
 * to display (when you install Khove on an org, we show the org, not the connecting
 * user). Uses the App JWT, so it also confirms the private key + installation work.
 */
export async function getInstallationAccount(
  installationId: number,
): Promise<{ login: string; type: string; avatarUrl: string } | null> {
  try {
    const app = makeApp();
    const { data } = await app.octokit.request("GET /app/installations/{installation_id}", {
      installation_id: installationId,
    });
    const acc = data.account as { login?: string; type?: string; avatar_url?: string } | null;
    if (!acc?.login) return null;
    return { login: acc.login, type: acc.type ?? "Organization", avatarUrl: acc.avatar_url ?? "" };
  } catch (err) {
    console.error("[getInstallationAccount] failed:", err);
    return null;
  }
}

/**
 * Get the client the PR Shepherd should act with for a workspace.
 * Prefers the App **installation** token (acts as the Khove bot — can read/write
 * on any installed repo regardless of who triggered the event); falls back to
 * the connecting user's token when no installation is recorded.
 */
export async function getShepherdClient(workspaceId: string): Promise<Octokit> {
  const integration = await db.integration.findFirst({
    where: { workspaceId, provider: "GITHUB", isActive: true },
  });
  if (!integration) {
    throw new Error("GitHub is not connected");
  }

  const meta = (integration.metadata ?? {}) as Record<string, unknown>;
  const installationId = typeof meta.installationId === "number" ? meta.installationId : undefined;

  if (installationId) {
    try {
      return (await getInstallationClient(installationId)) as unknown as Octokit;
    } catch (err) {
      console.error("[getShepherdClient] installation client failed, falling back to user token:", err);
    }
  }

  return new Octokit({ auth: decrypt(integration.accessTokenEnc) });
}

/**
 * List ALL repositories the App installation can access (public AND private,
 * across the org it's installed on) — paginated via the installation token.
 * Throws when no installation is recorded so the caller can fall back to owned
 * repos only in that genuine case (never masking org/private repos otherwise).
 */
export async function listInstallationRepos(workspaceId: string) {
  const integration = await db.integration.findFirst({
    where: { workspaceId, provider: "GITHUB", isActive: true },
    select: { metadata: true },
  });
  const installationId = ((integration?.metadata ?? {}) as Record<string, unknown>).installationId;
  if (typeof installationId !== "number") {
    throw new Error("No GitHub App installation recorded for this workspace");
  }

  const octokit = (await getInstallationClient(installationId)) as unknown as {
    paginate: (route: string, opts: Record<string, unknown>) => Promise<unknown[]>;
  };
  const repos = (await octokit.paginate("GET /installation/repositories", { per_page: 100 })) as Array<{
    id: number;
    name: string;
    full_name: string;
    owner: { login: string };
    private: boolean;
    html_url: string;
    default_branch: string;
    language?: string | null;
    description?: string | null;
    pushed_at?: string | null;
    open_issues_count?: number;
  }>;

  return repos.map((repo) => ({
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    owner: repo.owner.login,
    private: repo.private,
    url: repo.html_url,
    defaultBranch: repo.default_branch,
    language: repo.language ?? null,
    description: repo.description ?? null,
    pushedAt: repo.pushed_at ?? null,
    openIssuesCount: repo.open_issues_count ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// Releases + milestones (context entities)
// ---------------------------------------------------------------------------

/** Recent releases for a repo (name, tag, published, prerelease/draft). */
export async function listReleases(workspaceId: string, owner: string, repo: string, client?: Octokit, perPage = 20) {
  const octokit = client ?? (await getGitHubClient(workspaceId));
  const { data } = await octokit.repos.listReleases({ owner, repo, per_page: perPage });
  return data.map((r) => ({
    id: r.id,
    tag: r.tag_name,
    name: r.name || r.tag_name,
    url: r.html_url,
    publishedAt: r.published_at,
    draft: r.draft,
    prerelease: r.prerelease,
  }));
}

/** Milestones for a repo (title, state, due date, open/closed issue counts). */
export async function listMilestones(
  workspaceId: string,
  owner: string,
  repo: string,
  state: "open" | "closed" | "all" = "all",
  client?: Octokit,
) {
  const octokit = client ?? (await getGitHubClient(workspaceId));
  const { data } = await octokit.issues.listMilestones({ owner, repo, state, per_page: 50 });
  return data.map((m) => ({
    number: m.number,
    title: m.title,
    url: m.html_url,
    state: m.state,
    dueOn: m.due_on,
    openIssues: m.open_issues,
    closedIssues: m.closed_issues,
  }));
}

// ---------------------------------------------------------------------------
// User info
// ---------------------------------------------------------------------------

/**
 * Get the authenticated user's GitHub profile.
 */
export async function getGitHubUser(workspaceId: string) {
  const octokit = await getGitHubClient(workspaceId);
  const { data } = await octokit.users.getAuthenticated();
  return {
    login: data.login,
    id: data.id,
    name: data.name,
    avatarUrl: data.avatar_url,
    email: data.email,
  };
}

// ---------------------------------------------------------------------------
// Repositories
// ---------------------------------------------------------------------------

/**
 * List repositories accessible to the authenticated user.
 */
export async function listUserRepos(
  workspaceId: string,
  options?: { sort?: "updated" | "created" | "pushed"; per_page?: number }
) {
  const octokit = await getGitHubClient(workspaceId);
  const { data } = await octokit.repos.listForAuthenticatedUser({
    sort: options?.sort ?? "updated",
    per_page: options?.per_page ?? 30,
    type: "owner",
  });

  return data.map((repo) => ({
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    owner: repo.owner.login,
    private: repo.private,
    description: repo.description,
    url: repo.html_url,
    defaultBranch: repo.default_branch,
    language: repo.language,
    updatedAt: repo.updated_at,
    stargazersCount: repo.stargazers_count,
    openIssuesCount: repo.open_issues_count,
  }));
}

// ---------------------------------------------------------------------------
// Pull Requests
// ---------------------------------------------------------------------------

/**
 * List pull requests for a repository.
 */
export async function listPullRequests(
  workspaceId: string,
  owner: string,
  repo: string,
  state: "open" | "closed" | "all" = "open",
  perPage = 20,
  client?: Octokit,
) {
  const octokit = client ?? (await getGitHubClient(workspaceId));
  const { data } = await octokit.pulls.list({
    owner,
    repo,
    state,
    per_page: perPage,
    sort: "updated",
    direction: "desc",
  });

  return data.map((pr) => ({
    number: pr.number,
    title: pr.title,
    state: pr.state,
    draft: pr.draft,
    url: pr.html_url,
    author: pr.user?.login,
    headSha: pr.head?.sha,
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    mergedAt: pr.merged_at,
    milestone: pr.milestone?.title ?? null,
    labels: pr.labels.map((l) => (typeof l === "object" && l !== null ? (l as { name?: string }).name ?? "" : "")),
    reviewers: pr.requested_reviewers?.map((r) => ("login" in r ? (r as { login: string }).login : "")) ?? [],
  }));
}

/**
 * Get details for a single pull request.
 */
export async function getPullRequest(
  workspaceId: string,
  owner: string,
  repo: string,
  pullNumber: number,
  client?: Octokit,
) {
  const octokit = client ?? (await getGitHubClient(workspaceId));
  const [{ data: pr }, { data: reviews }] = await Promise.all([
    octokit.pulls.get({ owner, repo, pull_number: pullNumber }),
    octokit.pulls.listReviews({ owner, repo, pull_number: pullNumber }),
  ]);

  return {
    number: pr.number,
    title: pr.title,
    body: pr.body,
    state: pr.state,
    draft: pr.draft,
    merged: pr.merged,
    url: pr.html_url,
    author: pr.user?.login,
    head: pr.head.ref,
    base: pr.base.ref,
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    mergedAt: pr.merged_at,
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changed_files,
    labels: pr.labels.map((l) => l.name),
    reviews: reviews.map((r) => ({
      user: r.user?.login,
      state: r.state,
      submittedAt: r.submitted_at,
    })),
  };
}

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

/**
 * List issues for a repository.
 */
export async function listIssues(
  workspaceId: string,
  owner: string,
  repo: string,
  state: "open" | "closed" | "all" = "open",
  perPage = 20,
  client?: Octokit,
) {
  const octokit = client ?? (await getGitHubClient(workspaceId));
  const { data } = await octokit.issues.listForRepo({
    owner,
    repo,
    state,
    per_page: perPage,
    sort: "updated",
    direction: "desc",
  });

  // Filter out pull requests (GitHub returns PRs in issues endpoint)
  return data
    .filter((issue) => !issue.pull_request)
    .map((issue) => ({
      number: issue.number,
      title: issue.title,
      state: issue.state,
      url: issue.html_url,
      author: issue.user?.login,
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      milestone: issue.milestone?.title ?? null,
      labels: issue.labels.map((l) => (typeof l === "string" ? l : l.name ?? "")),
      assignees: issue.assignees?.map((a) => a.login) ?? [],
    }));
}

/**
 * Create a new issue in a repository.
 */
export async function createIssue(
  workspaceId: string,
  owner: string,
  repo: string,
  title: string,
  body?: string,
  labels?: string[],
  client?: Octokit,
) {
  const octokit = client ?? (await getGitHubClient(workspaceId));
  const { data } = await octokit.issues.create({
    owner,
    repo,
    title,
    body,
    labels,
  });

  return {
    number: data.number,
    title: data.title,
    url: data.html_url,
    state: data.state,
  };
}

// ---------------------------------------------------------------------------
// Shepherd writes — act as the App installation (governed: approval-gated)
// ---------------------------------------------------------------------------

/**
 * Post a comment on a pull request (a PR is an issue for the comments API).
 * Uses the Shepherd client so it posts as the Khove app.
 */
export async function commentOnPR(
  workspaceId: string,
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
): Promise<{ url: string }> {
  const octokit = await getShepherdClient(workspaceId);
  const { data } = await octokit.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body,
  });
  return { url: data.html_url };
}

/**
 * Request reviewers on a pull request. Uses the Shepherd client.
 */
export async function requestReviewers(
  workspaceId: string,
  owner: string,
  repo: string,
  prNumber: number,
  reviewers: string[],
): Promise<void> {
  const octokit = await getShepherdClient(workspaceId);
  await octokit.pulls.requestReviewers({
    owner,
    repo,
    pull_number: prNumber,
    reviewers,
  });
}

// ---------------------------------------------------------------------------
// Repository Activity
// ---------------------------------------------------------------------------

/**
 * Get recent activity (commits) for a repository.
 */
export async function getRepoActivity(
  workspaceId: string,
  owner: string,
  repo: string,
  perPage = 10,
  client?: Octokit,
) {
  const octokit = client ?? (await getGitHubClient(workspaceId));
  const { data } = await octokit.repos.listCommits({
    owner,
    repo,
    per_page: perPage,
  });

  return data.map((commit) => ({
    sha: commit.sha.slice(0, 7),
    message: commit.commit.message.split("\n")[0],
    author: commit.commit.author?.name ?? commit.author?.login,
    date: commit.commit.author?.date,
    url: commit.html_url,
  }));
}

// ---------------------------------------------------------------------------
// Webhook signature verification
// ---------------------------------------------------------------------------

/**
 * Verify GitHub webhook signature using constant-time comparison.
 */
export async function verifyWebhookSignature(
  payload: string,
  signature: string
): Promise<boolean> {
  const secret = process.env.GITHUB_APP_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const expected = `sha256=${Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("")}`;

  // Constant-time comparison
  if (expected.length !== signature.length) return false;
  let result = 0;
  for (let i = 0; i < expected.length; i++) {
    result |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return result === 0;
}
