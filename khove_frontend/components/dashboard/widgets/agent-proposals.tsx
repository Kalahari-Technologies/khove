"use client";

import Link from "next/link";
import { Bot, Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Chip } from "@/components/integrations/insight-ui";
import { AGENT_TYPE_ICON, AGENT_GITHUB_TYPES } from "@/components/agent/agent-action-card";
import type { WidgetProps } from "@/components/dashboard/widget-types";
import { WLoading, WEmpty } from "./_kit";

/** Pending agent proposals awaiting approval. */
export function AgentProposalsWidget({ slug }: WidgetProps) {
  const { data, isLoading } = trpc.agentAction.list.useQuery(undefined, { staleTime: 60_000 });

  if (isLoading) return <WLoading height={120} />;

  const pending = (data ?? []).filter((a) => a.status === "PENDING");
  if (pending.length === 0) return <WEmpty icon={<Bot size={18} />}>No pending proposals</WEmpty>;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-white/40">{pending.length} awaiting review</span>
        <Link href={`/${slug}/agent`} className="text-[11px] text-white/50 hover:text-white/80">
          View all →
        </Link>
      </div>
      <ul className="space-y-1">
        {pending.slice(0, 6).map((a) => {
          const conf = typeof a.confidence === "number" ? Math.round(a.confidence * 100) : null;
          const Icon = AGENT_TYPE_ICON[a.type] ?? Sparkles;
          const isGithub = AGENT_GITHUB_TYPES.has(a.type);
          return (
            <li key={a.id} className="flex items-center gap-2">
              <Icon size={13} className={`shrink-0 ${isGithub ? "text-emerald-300/80" : "text-teal-300/80"}`} />
              <span className="min-w-0 flex-1 truncate text-[12px] text-white/80">{a.title}</span>
              {conf != null ? <Chip tone="neutral">{conf}%</Chip> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
