import type { SignalInput } from "@backend/lib/signals/record";

const GH = "GITHUB" as const;
const ts = (s?: string | null) => (s ? new Date(s) : new Date());

interface PRObject {
  number: number;
  created_at?: string;
  updated_at?: string;
  merged_at?: string | null;
  closed_at?: string | null;
  merged?: boolean;
  user?: { login?: string };
}

/** Normalize a `pull_request` webhook into flow Signals (lifecycle events only). */
export function prWebhookSignals(action: string, pr: PRObject, repoFullName: string): SignalInput[] {
  const entityKey = `github-pr-${repoFullName}-${pr.number}`;
  const base = { provider: GH, entityType: "pull_request", entityKey, source: repoFullName };
  const author = pr.user?.login ?? null;

  switch (action) {
    case "opened":
      return [{ ...base, kind: "WORK_OPENED", actorKey: author, occurredAt: ts(pr.created_at) }];
    case "reopened":
      return [{ ...base, kind: "WORK_REOPENED", actorKey: author, occurredAt: ts(pr.updated_at) }];
    case "closed":
      return pr.merged
        ? [
            { ...base, kind: "WORK_MERGED", actorKey: author, occurredAt: ts(pr.merged_at) },
            // A merge to the tracked repo is our deployment-frequency proxy.
            { ...base, kind: "DEPLOY", actorKey: author, occurredAt: ts(pr.merged_at) },
          ]
        : [{ ...base, kind: "WORK_CLOSED", actorKey: author, occurredAt: ts(pr.closed_at) }];
    default:
      return [];
  }
}

/** A submitted PR review → REVIEW_SUBMITTED (carries the decision in metadata). */
export function reviewSubmittedSignal(
  repoFullName: string,
  prNumber: number,
  reviewer: string | undefined,
  state: string | undefined,
  submittedAt: string | undefined,
): SignalInput {
  return {
    provider: GH,
    kind: "REVIEW_SUBMITTED",
    entityType: "pull_request",
    entityKey: `github-pr-${repoFullName}-${prNumber}`,
    source: repoFullName,
    actorKey: reviewer ?? null,
    occurredAt: ts(submittedAt),
    metadata: { state: (state ?? "").toLowerCase() },
  };
}

/** A completed CI run for a PR → CI_COMPLETED (success/failure/pending in metadata). */
export function ciCompletedSignal(entityKey: string, repoFullName: string, ciStatus: string): SignalInput {
  return {
    provider: GH,
    kind: "CI_COMPLETED",
    entityType: "pull_request",
    entityKey,
    source: repoFullName,
    occurredAt: new Date(),
    metadata: { ciStatus },
  };
}

/** Backfill: a merged PR fetched from the API → its open + merge Signals. */
export function backfilledMergedPR(
  repoFullName: string,
  prNumber: number,
  author: string | undefined,
  createdAt: string | undefined,
  mergedAt: string | undefined,
): SignalInput[] {
  const entityKey = `github-pr-${repoFullName}-${prNumber}`;
  const base = { provider: GH, entityType: "pull_request", entityKey, source: repoFullName, actorKey: author ?? null };
  return [
    { ...base, kind: "WORK_OPENED", occurredAt: ts(createdAt) },
    { ...base, kind: "WORK_MERGED", occurredAt: ts(mergedAt) },
    { ...base, kind: "DEPLOY", occurredAt: ts(mergedAt) },
  ];
}
