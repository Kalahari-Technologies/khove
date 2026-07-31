"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Clock, Link2, Users, Check, X, Ban, Sparkles, UserPlus, AlertTriangle, TrendingDown } from "lucide-react";
import { trpc } from "@/lib/trpc/client";

export interface AgentActionView {
  id: string;
  type: string;
  status: string;
  title: string;
  rationale: string;
  confidence: number | null;
  error?: string | null;
}

/** Proposal type → glyph. Shared with the dashboard Agent Proposals widget. */
export const AGENT_TYPE_ICON: Record<string, typeof Clock> = {
  BLOCK_FOCUS_TIME: Clock,
  RESCHEDULE_EVENT: CalendarClock,
  RSVP_NUDGE: Users,
  SUGGEST_THREAD: Link2,
  CREATE_EVENT: CalendarClock,
  // PR Shepherd
  NUDGE_REVIEWER: Users,
  REQUEST_REVIEW: UserPlus,
  FLAG_PR: AlertTriangle,
  // Delivery intelligence
  FLAG_RISK: TrendingDown,
};

/** True for the GitHub PR Shepherd action types (emerald accent instead of teal). */
export const AGENT_GITHUB_TYPES = new Set(["NUDGE_REVIEWER", "REQUEST_REVIEW", "FLAG_PR"]);

/**
 * A single proposed agent action with Approve / Reject / Dismiss. Approve executes
 * the write (PRO+); on a free plan the backend returns upgradeRequired.
 */
export function AgentActionCard({ action, compact = false }: { action: AgentActionView; compact?: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState<string | null>(action.error ?? null);
  const Icon = AGENT_TYPE_ICON[action.type] ?? Sparkles;
  const isGithub = AGENT_GITHUB_TYPES.has(action.type);

  const approve = trpc.agentAction.approve.useMutation({
    onSuccess: (data) => {
      if (data && "upgradeRequired" in data && data.upgradeRequired) {
        setNote("Approving actions needs a Pro plan.");
      } else if (data && "error" in data && data.error) {
        setNote(String(data.error));
      } else {
        router.refresh();
      }
    },
    onError: (e) => setNote(e.message),
  });
  const reject = trpc.agentAction.reject.useMutation({ onSuccess: () => router.refresh() });
  const dismiss = trpc.agentAction.dismiss.useMutation({ onSuccess: () => router.refresh() });

  const busy = approve.isPending || reject.isPending || dismiss.isPending;

  return (
    <div className={`rounded-xl border border-white/[0.08] bg-white/[0.02] ${compact ? "p-3" : "p-4"}`}>
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 w-7 h-7 rounded-lg border flex items-center justify-center flex-shrink-0 ${
            isGithub ? "bg-emerald-400/10 border-emerald-400/20" : "bg-teal-400/10 border-teal-400/20"
          }`}
        >
          <Icon size={14} className={isGithub ? "text-emerald-300" : "text-teal-300"} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="text-[13px] font-semibold text-white/90 leading-tight">{action.title}</h4>
            {action.confidence != null && (
              <span className="text-[10px] text-white/35 flex-shrink-0">{Math.round(action.confidence * 100)}%</span>
            )}
          </div>
          <p className="text-[12px] text-white/50 mt-1 leading-relaxed">{action.rationale}</p>

          {note && <p className="text-[11px] text-amber-300/90 mt-2">{note}</p>}

          <div className="flex items-center gap-2 mt-3">
            <button
              disabled={busy}
              onClick={() => approve.mutate({ id: action.id })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-black text-[12px] font-medium hover:bg-white/90 transition-colors disabled:opacity-40"
            >
              <Check size={13} /> {approve.isPending ? "Approving…" : "Approve"}
            </button>
            <button
              disabled={busy}
              onClick={() => reject.mutate({ id: action.id })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.1] text-white/60 text-[12px] hover:bg-white/[0.05] hover:text-white/80 transition-colors disabled:opacity-40"
            >
              <X size={13} /> Reject
            </button>
            <button
              disabled={busy}
              onClick={() => dismiss.mutate({ id: action.id })}
              title="Dismiss"
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-white/35 text-[12px] hover:text-white/60 transition-colors disabled:opacity-40"
            >
              <Ban size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
