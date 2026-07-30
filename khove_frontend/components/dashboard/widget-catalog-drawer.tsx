"use client";

import { X } from "lucide-react";
import type { WidgetCategory, WidgetDef } from "@/components/dashboard/widget-types";
import { WIDGET_CATALOG } from "@/components/dashboard/widget-registry";

const CATEGORY_ORDER: WidgetCategory[] = ["KPI", "Cross-tool", "GitHub", "Jira", "Calendar", "Agent", "AI"];

/** A slide-in catalog of every widget type, grouped by category. */
export function WidgetCatalogDrawer({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (def: WidgetDef) => void }) {
  if (!open) return null;

  const byCat = new Map<WidgetCategory, WidgetDef[]>();
  for (const def of WIDGET_CATALOG) {
    (byCat.get(def.category) ?? byCat.set(def.category, []).get(def.category)!).push(def);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col border-l border-white/[0.08] bg-[#0b0b0d] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
          <div>
            <h2 className="text-[14px] font-semibold text-white/85">Add a widget</h2>
            <p className="text-[12px] text-white/40">Pick a card to drop onto your dashboard.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-white/40 hover:bg-white/[0.06] hover:text-white/80">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {CATEGORY_ORDER.filter((c) => byCat.has(c)).map((cat) => (
            <section key={cat} className="mb-5">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/35">{cat}</h3>
              <div className="grid grid-cols-1 gap-2">
                {byCat.get(cat)!.map((def) => {
                  const Icon = def.icon;
                  return (
                    <button
                      key={def.type}
                      type="button"
                      onClick={() => onAdd(def)}
                      className="flex items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3 text-left transition-colors hover:border-white/[0.16] hover:bg-white/[0.05]"
                    >
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-white/60">
                        <Icon size={15} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium text-white/85">{def.title}</span>
                        <span className="block text-[11.5px] leading-snug text-white/40">{def.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
