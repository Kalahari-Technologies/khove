import type { IntegrationProvider, Prisma, SignalKind } from "@prisma/client";
import { db } from "@backend/lib/db";

/**
 * A normalized, provider-agnostic event. Every integration reduces its webhooks +
 * backfill into these, and the intelligence layer (flow metrics, burn-up, DORA,
 * correlators) reads only Signals — so a new adapter lights up the same charts.
 * See product_docs/Connectivity Intelligence — Design.md.
 */
export interface SignalInput {
  provider: IntegrationProvider;
  kind: SignalKind;
  entityType: string; // "pull_request" | "issue" | "jira_issue" | ...
  entityKey: string; // stable id, e.g. "github-pr-org/web-123"
  source?: string | null; // repo full_name / project key (the scope unit)
  actorKey?: string | null; // normalized person key (login / email / accountId)
  occurredAt: Date; // when it HAPPENED (payload timestamp, not ingest time)
  metadata?: Prisma.InputJsonValue;
}

/**
 * Idempotently record normalized Signals. The unique key
 * [workspaceId, provider, kind, entityKey, occurredAt] means replaying a webhook or
 * re-running a backfill never double-counts. Returns the number newly inserted.
 */
export async function recordSignals(workspaceId: string, signals: SignalInput[]): Promise<number> {
  if (signals.length === 0) return 0;
  const res = await db.signal.createMany({
    data: signals.map((s) => ({
      workspaceId,
      provider: s.provider,
      kind: s.kind,
      entityType: s.entityType,
      entityKey: s.entityKey,
      source: s.source ?? null,
      actorKey: s.actorKey ?? null,
      occurredAt: s.occurredAt,
      metadata: s.metadata ?? {},
    })),
    skipDuplicates: true, // relies on the @@unique idempotency key
  });
  return res.count;
}
