import {
  Activity,
  Calendar,
  CircleCheck,
  CircleDot,
  Eye,
  GitMerge,
  GitPullRequestArrow,
  MessageSquare,
  RefreshCw,
  Rocket,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

/**
 * Shared humanizers for cross-tool activity + entity keys, so every surface
 * (activity widget, cockpit timeline, unplanned work) reads like plain English
 * to a PM — never a raw system id like `github-pr-Org/repo-43` or `[TROCO-1]`.
 */

export type EntityKind = "jira" | "github_pr" | "github_issue" | "other";

export interface EntityLabel {
  kind: EntityKind;
  /** e.g. "TROCO-1" (Jira) or "#43" (GitHub). */
  key: string | null;
  /** e.g. the short repo name for GitHub. */
  context: string | null;
  raw: string;
}

/** `jira-TROCO-14` → TROCO-14 ; `github-pr-Org/troco-admin-43` → { #43, troco-admin }. */
export function humanizeEntityKey(entityKey: string): EntityLabel {
  if (entityKey.startsWith("jira-")) {
    return { kind: "jira", key: entityKey.slice(5), context: null, raw: entityKey };
  }
  const gh = entityKey.match(/^github-(pr|issue)-(.+)-(\d+)$/);
  if (gh) {
    const repo = gh[2].split("/").pop() ?? gh[2];
    return {
      kind: gh[1] === "pr" ? "github_pr" : "github_issue",
      key: `#${gh[3]}`,
      context: repo,
      raw: entityKey,
    };
  }
  return { kind: "other", key: null, context: null, raw: entityKey };
}

/** A compact one-line label: "PR #43 · troco-admin", "TROCO-1", or the raw string. */
export function entityLabelText(entityKey: string): string {
  const e = humanizeEntityKey(entityKey);
  if (e.kind === "jira") return e.key ?? e.raw;
  if (e.kind === "github_pr") return `PR ${e.key} · ${e.context}`;
  if (e.kind === "github_issue") return `Issue ${e.key} · ${e.context}`;
  return e.raw;
}

/** Split a `[TROCO-1] Summary` title into its bold key + the rest. */
export function splitKeyTitle(title: string): { key: string | null; rest: string } {
  const m = title.match(/^\[([A-Z][A-Z0-9]+-\d+)\]\s*(.*)$/);
  if (m) return { key: m[1], rest: m[2] };
  return { key: null, rest: title };
}

/** The provider a signal/entity comes from, normalized to the ProviderIcon keys. */
export function providerKey(provider: string | null | undefined): string {
  const p = (provider ?? "").toUpperCase();
  if (p === "GITHUB") return "github";
  if (p === "JIRA") return "jira";
  if (p === "GOOGLE_CALENDAR") return "google_calendar";
  return p.toLowerCase();
}

export interface KindMeta {
  verb: string;
  tone: string;
  Icon: LucideIcon;
}

const KIND: Record<string, KindMeta> = {
  WORK_OPENED: { verb: "opened", tone: "text-sky-300/80", Icon: GitPullRequestArrow },
  WORK_MERGED: { verb: "merged", tone: "text-violet-300/80", Icon: GitMerge },
  WORK_CLOSED: { verb: "closed", tone: "text-emerald-300/80", Icon: CircleCheck },
  WORK_REOPENED: { verb: "reopened", tone: "text-amber-300/80", Icon: RefreshCw },
  REVIEW_REQUESTED: { verb: "review requested", tone: "text-amber-300/80", Icon: Eye },
  REVIEW_SUBMITTED: { verb: "reviewed", tone: "text-emerald-300/80", Icon: Eye },
  STATUS_CHANGED: { verb: "moved", tone: "text-sky-300/80", Icon: CircleDot },
  CI_COMPLETED: { verb: "CI ran", tone: "text-white/50", Icon: Activity },
  DEPLOY: { verb: "deployed", tone: "text-emerald-300/80", Icon: Rocket },
  COMMENT: { verb: "commented", tone: "text-white/50", Icon: MessageSquare },
  MEETING_HELD: { verb: "met", tone: "text-rose-300/80", Icon: Calendar },
  DECISION: { verb: "decided", tone: "text-violet-300/80", Icon: Sparkles },
};

export function kindMeta(kind: string): KindMeta {
  return KIND[kind] ?? { verb: kind.toLowerCase().replace(/_/g, " "), tone: "text-white/50", Icon: Activity };
}
