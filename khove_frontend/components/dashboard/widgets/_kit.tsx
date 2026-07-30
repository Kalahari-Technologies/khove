"use client";

import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
import { EmptyState } from "@/components/integrations/insight-ui";
import { ProviderIcon } from "@/components/provider-icon";

/** Subtle animated placeholder shown while a widget loads its data. */
export function WLoading({ height = 120 }: { height?: number }) {
  return <div className="animate-pulse rounded-lg bg-white/[0.02]" style={{ height }} />;
}

/** Centered empty-state for a widget body — icon + message, filling the card height. */
export function WEmpty({ children = "Nothing to show", icon }: { children?: ReactNode; icon?: ReactNode }) {
  return <EmptyState icon={icon ?? <Inbox size={18} />} message={children} className="h-full" />;
}

/**
 * Wraps a short list so any leftover height in the widget's grid cell isn't dead
 * space — it's filled with a large, faint brand watermark. When the list is long
 * enough to fill (or overflow) the cell, the spacer collapses and the mark hides.
 */
export function WFill({ provider, children }: { provider: string; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      {children}
      <div className="flex min-h-0 flex-1 items-center justify-center pt-3" aria-hidden>
        <ProviderIcon provider={provider} size={52} className="opacity-[0.05]" />
      </div>
    </div>
  );
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

/** Safely read a namespaced object off a Prisma JSON `metadata` value. */
export function metaKey(metadata: unknown, key: string): Record<string, unknown> {
  if (metadata && typeof metadata === "object") {
    const v = (metadata as Record<string, unknown>)[key];
    if (v && typeof v === "object") return v as Record<string, unknown>;
  }
  return {};
}
