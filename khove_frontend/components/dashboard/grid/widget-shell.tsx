"use client";

import { useState, type DragEventHandler, type PointerEventHandler } from "react";
import { GripVertical, RefreshCw, Settings2, X } from "lucide-react";
import type { WidgetConfig } from "@khove/shared";
import { WIDGET_REGISTRY } from "@/components/dashboard/widget-registry";
import { ProviderIcon } from "@/components/provider-icon";
import { HelpTip } from "@/components/help-tip";

/** The source platform a widget draws from — for the header brand icon. */
function providerForWidget(type: string, settings: Record<string, unknown>): string | null {
  if (type.startsWith("github.")) return "github";
  if (type.startsWith("jira.")) return "jira";
  if (type.startsWith("calendar.") || type.startsWith("planner.")) return "google_calendar";
  if (type.startsWith("kpi.")) {
    const p = settings.provider;
    return p === "github" ? "github" : p === "jira" ? "jira" : null;
  }
  return null; // cross-tool / agent / ai widgets are multi-source
}

/**
 * The frame around a single widget: card + header (icon/title) + body (the widget
 * component) + edit chrome. In VIEW mode it's clean and static; in EDIT mode a
 * hover toolbar (drag grip, refresh, settings, remove) and a resize handle appear.
 */
export function WidgetShell({
  widget,
  editing,
  workspaceId,
  slug,
  onRemove,
  onOpenSettings,
  dragHandle,
  onResizePointerDown,
}: {
  widget: WidgetConfig;
  editing: boolean;
  workspaceId: string;
  slug: string;
  onRemove: (id: string) => void;
  onOpenSettings: (id: string) => void;
  dragHandle: { draggable: boolean; onDragStart: DragEventHandler; onDragEnd: DragEventHandler };
  onResizePointerDown: PointerEventHandler;
}) {
  const def = WIDGET_REGISTRY[widget.type];
  const [nonce, setNonce] = useState(0);

  if (!def) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.015] text-[12px] text-white/30">
        Unknown widget: {widget.type}
      </div>
    );
  }

  const Icon = def.icon;
  const Body = def.component;
  const hasSettings = !!def.settingsSchema?.length;
  const provider = providerForWidget(widget.type, widget.settings);

  return (
    <div
      className={[
        "group/widget relative flex h-full flex-col overflow-hidden rounded-2xl border bg-white/[0.015] transition-colors",
        editing ? "border-white/[0.12]" : "border-white/[0.07]",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-2 px-3.5 pt-3 pb-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {editing && (
            <button
              type="button"
              {...dragHandle}
              className="-ml-1 cursor-grab text-white/25 hover:text-white/60 active:cursor-grabbing"
              title="Drag to reorder"
              aria-label="Drag to reorder"
            >
              <GripVertical size={14} />
            </button>
          )}
          {provider ? (
            <ProviderIcon provider={provider} size={13} className="shrink-0 opacity-80" />
          ) : (
            <Icon size={13} className="shrink-0 text-white/40" />
          )}
          <h3 className="truncate text-[12px] font-semibold uppercase tracking-wide text-white/60">{def.title}</h3>
        </div>

        <div className="flex items-center gap-0.5">
          <span className="opacity-60 transition-opacity group-hover/widget:opacity-100">
            <HelpTip text={def.description} />
          </span>
          {editing && (
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/widget:opacity-100">
            <button
              type="button"
              onClick={() => setNonce((n) => n + 1)}
              className="rounded-md p-1 text-white/35 hover:bg-white/[0.06] hover:text-white/70"
              title="Refresh"
            >
              <RefreshCw size={12.5} />
            </button>
            {hasSettings && (
              <button
                type="button"
                onClick={() => onOpenSettings(widget.id)}
                className="rounded-md p-1 text-white/35 hover:bg-white/[0.06] hover:text-white/70"
                title="Settings"
              >
                <Settings2 size={12.5} />
              </button>
            )}
            <button
              type="button"
              onClick={() => onRemove(widget.id)}
              className="rounded-md p-1 text-white/35 hover:bg-red-500/15 hover:text-red-300"
              title="Remove"
            >
              <X size={12.5} />
            </button>
          </div>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-3.5 pb-3.5">
        <Body key={nonce} settings={widget.settings} workspaceId={workspaceId} slug={slug} />
      </div>

      {editing && (
        <span
          role="button"
          aria-label="Resize"
          onPointerDown={onResizePointerDown}
          className="absolute bottom-1 right-1 h-3.5 w-3.5 cursor-se-resize opacity-0 transition-opacity group-hover/widget:opacity-100"
          style={{
            background:
              "linear-gradient(135deg, transparent 0 50%, rgba(255,255,255,0.35) 50% 60%, transparent 60% 70%, rgba(255,255,255,0.35) 70% 80%, transparent 80%)",
          }}
        />
      )}
    </div>
  );
}
