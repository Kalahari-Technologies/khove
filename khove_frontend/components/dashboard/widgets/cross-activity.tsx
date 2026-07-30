"use client";

import { trpc } from "@/lib/trpc/client";
import { ago } from "@/components/integrations/insight-ui";
import type { WidgetProps } from "@/components/dashboard/widget-types";
import { WLoading, WEmpty } from "./_kit";

const DOT: Record<string, string> = {
  GITHUB: "bg-emerald-400/80",
  JIRA: "bg-indigo-400/80",
  GOOGLE_CALENDAR: "bg-rose-400/80",
};

/** Cross-tool activity timeline — one chronological stream. */
export function CrossActivityWidget(_props: WidgetProps) {
  const { data, isLoading } = trpc.metrics.activity.useQuery({ limit: 14 }, { staleTime: 60_000 });

  if (isLoading) return <WLoading height={140} />;

  const rows = data ?? [];
  if (rows.length === 0) return <WEmpty>No recent activity.</WEmpty>;

  return (
    <ul className="space-y-1.5">
      {rows.map((s) => {
        const label = s.title ?? s.entityKey ?? s.kind;
        return (
          <li key={s.id} className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[s.provider] ?? "bg-white/40"}`} />
            {s.url ? (
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-[12px] text-white/75 hover:text-white"
              >
                {label}
              </a>
            ) : (
              <span className="min-w-0 flex-1 truncate text-[12px] text-white/75">{label}</span>
            )}
            <span className="shrink-0 text-[10.5px] tabular-nums text-white/30">{ago(s.occurredAt)}</span>
          </li>
        );
      })}
    </ul>
  );
}
