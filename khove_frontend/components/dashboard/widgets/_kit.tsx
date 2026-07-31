"use client";

import type { ReactNode } from "react";
import { Inbox, Sparkles } from "lucide-react";
import { EmptyState } from "@/components/integrations/insight-ui";

/** Subtle animated placeholder shown while a widget loads its data. */
export function WLoading({ height = 120 }: { height?: number }) {
  return <div className="animate-pulse rounded-lg bg-white/[0.02]" style={{ height }} />;
}

/** Centered empty-state for a widget body — icon + message, filling the card height. */
export function WEmpty({ children = "Nothing to show", icon }: { children?: ReactNode; icon?: ReactNode }) {
  return <EmptyState icon={icon ?? <Inbox size={18} />} message={children} className="h-full" />;
}

/** A compact header stat line above a chart. */
export function WStat({ value, label }: { value: ReactNode; label: ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline gap-1.5">
      <span className="text-[15px] font-semibold tabular-nums text-white/90">{value}</span>
      <span className="text-[11px] text-white/40">{label}</span>
    </div>
  );
}

/**
 * A subtle AI-generated caption under a chart — a plain-language reading of what the
 * widget means and how it's tracking. The text is server-cached (regenerated only when
 * the data changes), so this just renders it. Renders nothing until text is available.
 */
export function WNarrative({ text }: { text?: string | null }) {
  if (!text) return null;
  return (
    <p className="mt-2.5 flex gap-1.5 text-[11px] leading-relaxed text-white/45">
      <Sparkles size={11} className="mt-[3px] shrink-0 text-white/30" />
      <span className="min-w-0">{text}</span>
    </p>
  );
}

/** Safely read a namespaced object off a Prisma JSON `metadata` value. */
export function metaKey(metadata: unknown, key: string): Record<string, unknown> {
  if (metadata && typeof metadata === "object") {
    const v = (metadata as Record<string, unknown>)[key];
    if (v && typeof v === "object") return v as Record<string, unknown>;
  }
  return {};
}
