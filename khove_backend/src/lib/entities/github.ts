import type { EntityInput } from "@backend/lib/entities/record";

const GH = "GITHUB" as const;

export function githubRepoEntity(repo: {
  fullName: string;
  url: string;
  private: boolean;
  language: string | null;
  description: string | null;
  pushedAt: string | null;
  defaultBranch: string;
}): EntityInput {
  return {
    provider: GH,
    kind: "REPOSITORY",
    externalId: `github-repo-${repo.fullName}`,
    key: repo.fullName,
    name: repo.fullName,
    url: repo.url,
    status: repo.private ? "private" : "public",
    metadata: {
      language: repo.language,
      description: repo.description,
      pushedAt: repo.pushedAt,
      defaultBranch: repo.defaultBranch,
    },
  };
}

export function githubReleaseEntity(
  repoFullName: string,
  r: { tag: string; name: string; url: string; publishedAt: string | null; draft: boolean; prerelease: boolean },
): EntityInput {
  return {
    provider: GH,
    kind: "RELEASE",
    externalId: `github-release-${repoFullName}-${r.tag}`,
    key: r.tag,
    name: r.name,
    url: r.url,
    status: r.draft ? "draft" : r.prerelease ? "prerelease" : "released",
    parentExternalId: `github-repo-${repoFullName}`,
    metadata: { repo: repoFullName, publishedAt: r.publishedAt },
  };
}

export function githubMilestoneEntity(
  repoFullName: string,
  m: { number: number; title: string; url: string; state: string; dueOn: string | null; openIssues: number; closedIssues: number },
): EntityInput {
  return {
    provider: GH,
    kind: "MILESTONE",
    externalId: `github-milestone-${repoFullName}-${m.number}`,
    key: `${repoFullName}#${m.number}`,
    name: m.title,
    url: m.url,
    status: m.state, // open | closed
    parentExternalId: `github-repo-${repoFullName}`,
    metadata: { repo: repoFullName, number: m.number, dueOn: m.dueOn, openIssues: m.openIssues, closedIssues: m.closedIssues },
  };
}
