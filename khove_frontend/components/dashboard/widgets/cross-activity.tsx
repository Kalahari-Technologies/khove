"use client";

import { Activity } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { ago } from "@/components/integrations/insight-ui";
import { ProviderIcon } from "@/components/provider-icon";
import { entityLabelText, kindMeta, providerKey, splitKeyTitle } from "@/lib/activity-format";
import type { WidgetProps } from "@/components/dashboard/widget-types";
import { WLoading, WEmpty } from "./_kit";

interface ActivityItem {
  id: string;
  provider: string;
  kind: string;
  entityKey: string;
  title: string | null;
  url: string | null;
  occurredAt: string;
}

/** The item's human label — bolds the ticket key, humanizes raw system ids. */
function ActivityLabel({ s }: { s: ActivityItem }) {
  if (s.title) {
    const { key, rest } = splitKeyTitle(s.title);
    if (key) {
      return (
        <>
          <span className="font-semibold text-white/90">{key}</span> {rest}
        </>
      );
    }
    return <>{s.title}</>;
  }
  return <>{entityLabelText(s.entityKey)}</>;
}

/** Cross-tool activity timeline — one chronological, PM-readable stream. */
export function CrossActivityWidget(_props: WidgetProps) {
  const { data, isLoading } = trpc.metrics.activity.useQuery({ limit: 14 }, { staleTime: 60_000 });

  if (isLoading) return <WLoading height={140} />;

  const rows = (data ?? []) as ActivityItem[];
  if (rows.length === 0) return <WEmpty icon={<Activity size={18} />}>No recent activity.</WEmpty>;

  return (
    <ul className="space-y-1.5">
      {rows.map((s) => {
        const km = kindMeta(s.kind);
        return (
          <li key={s.id} className="flex items-center gap-2">
            <ProviderIcon provider={providerKey(s.provider)} size={13} className="shrink-0 opacity-70" />
            <span className={`inline-flex shrink-0 items-center gap-1 text-[10.5px] ${km.tone}`}>
              <km.Icon size={11} />
              {km.verb}
            </span>
            {s.url ? (
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-[12px] text-white/70 hover:text-white"
              >
                <ActivityLabel s={s} />
              </a>
            ) : (
              <span className="min-w-0 flex-1 truncate text-[12px] text-white/70">
                <ActivityLabel s={s} />
              </span>
            )}
            <span className="shrink-0 text-[10.5px] tabular-nums text-white/30">{ago(s.occurredAt)}</span>
          </li>
        );
      })}
    </ul>
  );
}
