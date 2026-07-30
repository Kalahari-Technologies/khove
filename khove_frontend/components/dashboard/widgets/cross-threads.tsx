"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { Chip, ago } from "@/components/integrations/insight-ui";
import type { WidgetProps } from "@/components/dashboard/widget-types";
import { WLoading, WEmpty } from "./_kit";

/** Connectivity threads — cross-tool work items. */
export function CrossThreadsWidget({ slug }: WidgetProps) {
  const { data, isLoading } = trpc.thread.list.useQuery(undefined, { staleTime: 60_000 });

  if (isLoading) return <WLoading height={140} />;

  const threads = data ?? [];
  if (threads.length === 0) return <WEmpty>No connectivity threads yet.</WEmpty>;

  return (
    <ul className="space-y-1">
      {threads.slice(0, 8).map((t) => (
        <li key={t.id}>
          <Link
            href={`/${slug}/connections`}
            className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-white/[0.03]"
          >
            <span className="min-w-0 flex-1 truncate text-[12px] text-white/80">{t.title}</span>
            <Chip tone="accent">{t.links.length} link{t.links.length === 1 ? "" : "s"}</Chip>
            <span className="shrink-0 text-[10.5px] tabular-nums text-white/30">
              {ago(t.updatedAt instanceof Date ? t.updatedAt.toISOString() : (t.updatedAt as string))}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
