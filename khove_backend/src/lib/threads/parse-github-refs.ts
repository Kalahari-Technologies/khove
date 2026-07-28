import type { ThreadLinkKind } from "@prisma/client";

export interface GitHubRef {
  kind: Extract<ThreadLinkKind, "GITHUB_PR" | "GITHUB_ISSUE">;
  owner: string;
  repo: string;
  number: number;
  url: string;
  /** Matches the externalId scheme used by github-sync.ts for stored Tasks. */
  externalId: string;
}

// Full URLs: https://github.com/owner/repo/pull/123 or /issues/123
const URL_RE = /github\.com\/([\w.-]+)\/([\w.-]+)\/(pull|issues)\/(\d+)/gi;

/**
 * Extract GitHub PR/issue references from free text (e.g. a meeting's title or
 * description). Reconstructs the `github-pr-{owner/repo}-{n}` /
 * `github-issue-{owner/repo}-{n}` externalId used by the GitHub sync so a linked
 * Task can be matched. Dedupes by externalId.
 */
export function parseGitHubRefs(text: string | null | undefined): GitHubRef[] {
  if (!text) return [];
  const out = new Map<string, GitHubRef>();

  for (const m of text.matchAll(URL_RE)) {
    const [, owner, repo, kindRaw, numStr] = m;
    const number = Number(numStr);
    if (!owner || !repo || !Number.isFinite(number)) continue;
    const isPr = kindRaw.toLowerCase() === "pull";
    const fullName = `${owner}/${repo}`;
    const externalId = `${isPr ? "github-pr" : "github-issue"}-${fullName}-${number}`;
    out.set(externalId, {
      kind: isPr ? "GITHUB_PR" : "GITHUB_ISSUE",
      owner,
      repo,
      number,
      url: `https://github.com/${fullName}/${isPr ? "pull" : "issues"}/${number}`,
      externalId,
    });
  }

  return [...out.values()];
}
