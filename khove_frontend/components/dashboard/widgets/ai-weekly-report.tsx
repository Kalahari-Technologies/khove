"use client";

import { Loader2, Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { EmptyState } from "@/components/integrations/insight-ui";
import { RichText } from "@/components/rich-text";
import type { WidgetProps } from "@/components/dashboard/widget-types";

/** On-demand AI weekly status report. */
export function AiWeeklyReportWidget(_props: WidgetProps) {
  const report = trpc.metrics.statusReport.useMutation();

  const generate = () => report.mutate();

  if (report.isPending) {
    return (
      <div className="flex min-h-[80px] items-center justify-center gap-2 text-[12px] text-white/50">
        <Loader2 size={14} className="animate-spin" />
        Generating weekly update…
      </div>
    );
  }

  if (report.data?.report) {
    return (
      <div className="space-y-2.5">
        <RichText content={report.data.report} className="text-[12px] leading-relaxed text-white/75" />
        <button
          type="button"
          onClick={generate}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-1.5 text-[11px] text-white/60 transition-colors hover:bg-white/[0.05] hover:text-white/80"
        >
          <Sparkles size={12} />
          Regenerate
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-[80px] flex-col items-center justify-center gap-3 py-2 text-center">
      {report.isError ? (
        <p className="text-[11px] text-red-300/80">Couldn&apos;t generate a report. Try again.</p>
      ) : (
        <EmptyState icon={<Sparkles size={18} />} message="Summarise this week's delivery across your tools." />
      )}
      <button
        type="button"
        onClick={generate}
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.10] bg-white/[0.03] px-3 py-1.5 text-[12px] text-white/80 transition-colors hover:bg-white/[0.06]"
      >
        <Sparkles size={13} />
        Generate weekly update
      </button>
    </div>
  );
}
