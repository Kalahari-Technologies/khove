"use client";

import type { ReactNode } from "react";
import { CheckCircle2, GitCompareArrows } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import type { WidgetProps } from "@/components/dashboard/widget-types";
import { WLoading, WEmpty } from "./_kit";

interface Gap {
  issueKey: string;
  title: string;
  taskId: string;
}

function GapList({ label, gaps, tone }: { label: ReactNode; gaps: Gap[]; tone: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${tone}`} />
        <span className="text-[11px] font-medium text-white/60">{label}</span>
        <span className="text-[11px] tabular-nums text-white/30">{gaps.length}</span>
      </div>
      {gaps.length === 0 ? (
        <p className="text-[11px] text-white/25">None</p>
      ) : (
        <ul className="space-y-1">
          {gaps.slice(0, 4).map((g) => (
            <li key={g.issueKey + g.taskId} className="flex items-baseline gap-1.5">
              <span className="shrink-0 text-[10.5px] font-medium tabular-nums text-white/45">{g.issueKey}</span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-white/75">{g.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Cross-tool delivery gaps — where code and ticket status disagree. */
export function CrossGapsWidget(_props: WidgetProps) {
  const { data, isLoading } = trpc.metrics.crossToolIntegrity.useQuery(undefined, { staleTime: 60_000 });

  if (isLoading) return <WLoading height={140} />;
  if (!data) return <WEmpty icon={<GitCompareArrows size={18} />}>No linked work items.</WEmpty>;

  const ahead = data.codeAheadOfTicket ?? [];
  const behind = data.doneWithOpenPr ?? [];
  if (ahead.length === 0 && behind.length === 0) {
    return <WEmpty icon={<CheckCircle2 size={18} />}>Code and tickets are in sync.</WEmpty>;
  }

  return (
    <div className="space-y-3.5">
      <GapList label="Code merged, ticket open" gaps={ahead} tone="bg-amber-400/80" />
      <GapList label="Done, code open" gaps={behind} tone="bg-rose-400/80" />
    </div>
  );
}
