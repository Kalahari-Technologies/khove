"use client";

import Link from "next/link";
import { Waypoints } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Chip, ago } from "@/components/integrations/insight-ui";
import { ProviderIcon } from "@/components/provider-icon";
import type { WidgetProps } from "@/components/dashboard/widget-types";
import { WLoading, WEmpty } from "./_kit";

/** The representative source icon for a thread, from its linked items' kinds. */
function threadProvider(links: { kind: string }[]): string | null {
  const kinds = new Set(links.map((l) => l.kind));
  if (kinds.has("JIRA_ISSUE")) return "jira";
  if (kinds.has("GITHUB_PR") || kinds.has("GITHUB_ISSUE")) return "github";
  if (kinds.has("CALENDAR_EVENT")) return "google_calendar";
  return null;
}

/** Connectivity threads — cross-tool work items. */
export function CrossThreadsWidget({ slug }: WidgetProps) {
  const { data, isLoading } = trpc.thread.list.useQuery(undefined, { staleTime: 60_000 });

  if (isLoading) return <WLoading height={140} />;

  const threads = data ?? [];
  if (threads.length === 0) return <WEmpty icon={<Waypoints size={18} />}>No connectivity threads yet.</WEmpty>;

  return (
    <ul className="space-y-1">
      {threads.slice(0, 8).map((t) => {
        const provider = threadProvider(t.links);
        return (
        <li key={t.id}>
          <Link
            href={`/${slug}/connections`}
            className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-white/[0.03]"
          >
            {provider ? (
              <ProviderIcon provider={provider} size={13} className="shrink-0 opacity-80" />
            ) : (
              <Waypoints size={13} className="shrink-0 text-indigo-300/70" />
            )}
            <span className="min-w-0 flex-1 truncate text-[12px] text-white/80">{t.title}</span>
            <Chip tone="accent">{t.links.length} link{t.links.length === 1 ? "" : "s"}</Chip>
            <span className="shrink-0 text-[10.5px] tabular-nums text-white/30">
              {ago(t.updatedAt instanceof Date ? t.updatedAt.toISOString() : (t.updatedAt as string))}
            </span>
          </Link>
        </li>
        );
      })}
    </ul>
  );
}
