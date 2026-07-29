import type { SignalInput } from "@backend/lib/signals/record";
import type { JiraIssue } from "@backend/lib/integrations/jira";

// Jira issues → the SAME normalized Signals as GitHub, so flow metrics / status
// report / scope integrity work cross-platform. "Completed" (statusCategory=done)
// maps to WORK_MERGED — the universal "done for real" event the metrics fold on.

const JIRA = "JIRA" as const;
const ts = (s?: string | null) => (s ? new Date(s) : new Date());

function baseOf(issue: JiraIssue) {
  const source = issue.fields?.project?.key ?? issue.key.split("-")[0];
  return { provider: JIRA, entityType: "jira_issue", entityKey: `jira-${issue.key}`, source };
}

/** Backfill (initial/poll sync): open at created, + completed at updated if done. */
export function jiraBackfillSignals(issue: JiraIssue): SignalInput[] {
  if (!issue?.key) return [];
  const base = baseOf(issue);
  const cat = issue.fields?.status?.statusCategory?.key;
  const sigs: SignalInput[] = [{ ...base, kind: "WORK_OPENED", occurredAt: ts(issue.fields?.created ?? issue.fields?.updated) }];
  if (cat === "done") sigs.push({ ...base, kind: "WORK_MERGED", occurredAt: ts(issue.fields?.updated) });
  return sigs;
}

/** Live webhook events → lifecycle Signals. */
export function jiraWebhookSignals(webhookEvent: string | undefined, issue: JiraIssue): SignalInput[] {
  if (!issue?.key) return [];
  const base = baseOf(issue);
  const cat = issue.fields?.status?.statusCategory?.key;
  const updated = ts(issue.fields?.updated);

  if (webhookEvent === "jira:issue_created") {
    return [{ ...base, kind: "WORK_OPENED", occurredAt: ts(issue.fields?.created ?? issue.fields?.updated) }];
  }
  if (webhookEvent === "jira:issue_deleted") {
    return [{ ...base, kind: "WORK_CLOSED", occurredAt: updated }];
  }
  // issue_updated — record the transition, and completion when it lands in "done".
  const sigs: SignalInput[] = [{ ...base, kind: "STATUS_CHANGED", occurredAt: updated, metadata: { statusCategory: cat ?? "" } }];
  if (cat === "done") sigs.push({ ...base, kind: "WORK_MERGED", occurredAt: updated });
  return sigs;
}
