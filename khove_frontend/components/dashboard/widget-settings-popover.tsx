"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { WidgetConfig } from "@khove/shared";
import { WIDGET_REGISTRY } from "@/components/dashboard/widget-registry";

/** A small modal that edits a widget's `settings` from its declarative schema. */
export function WidgetSettingsPopover({
  widget,
  onClose,
  onSave,
}: {
  widget: WidgetConfig;
  onClose: () => void;
  onSave: (settings: Record<string, unknown>) => void;
}) {
  const def = WIDGET_REGISTRY[widget.type];
  const [draft, setDraft] = useState<Record<string, unknown>>({ ...widget.settings });

  if (!def?.settingsSchema?.length) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl border border-white/[0.1] bg-[#0d0d0f] p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-white/85">{def.title} settings</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-white/40 hover:bg-white/[0.06] hover:text-white/80">
            <X size={15} />
          </button>
        </div>

        <div className="space-y-3.5">
          {def.settingsSchema.map((f) => {
            const val = draft[f.key];
            return (
              <label key={f.key} className="block">
                <span className="mb-1 block text-[12px] text-white/55">{f.label}</span>
                {f.kind === "select" && (
                  <select
                    value={String(val ?? "")}
                    onChange={(e) => {
                      const opt = f.options?.find((o) => String(o.value) === e.target.value);
                      setDraft((d) => ({ ...d, [f.key]: opt ? opt.value : e.target.value }));
                    }}
                    className="w-full rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-[13px] text-white/85 outline-none focus:border-white/25"
                  >
                    {f.options?.map((o) => (
                      <option key={String(o.value)} value={String(o.value)} className="bg-[#0d0d0f]">
                        {o.label}
                      </option>
                    ))}
                  </select>
                )}
                {f.kind === "number" && (
                  <input
                    type="number"
                    value={Number(val ?? f.min ?? 0)}
                    min={f.min}
                    max={f.max}
                    onChange={(e) => setDraft((d) => ({ ...d, [f.key]: Number(e.target.value) }))}
                    className="w-full rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-[13px] text-white/85 outline-none focus:border-white/25"
                  />
                )}
                {f.kind === "toggle" && (
                  <button
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, [f.key]: !val }))}
                    className={`relative h-6 w-11 rounded-full transition-colors ${val ? "bg-indigo-500/70" : "bg-white/10"}`}
                  >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${val ? "left-[22px]" : "left-0.5"}`} />
                  </button>
                )}
              </label>
            );
          })}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-[12.5px] text-white/50 hover:text-white/80">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(draft)}
            className="rounded-lg bg-white/[0.1] px-3.5 py-1.5 text-[12.5px] font-medium text-white/90 hover:bg-white/[0.16]"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
