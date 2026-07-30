"use client";

import { useEffect, useRef, useState } from "react";
import { GRID_COLS, WIDGET_MAX_H, WIDGET_MAX_W, WIDGET_MIN_H, WIDGET_MIN_W, type WidgetConfig } from "@khove/shared";
import { WidgetShell } from "@/components/dashboard/grid/widget-shell";

const GAP = 12;
const ROW = 88;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * The 12-column flow grid. Widgets carry only `{w,h}` — their array order IS the
 * layout, so there's no collision math. Drag a header grip to reorder (native
 * dataTransfer); drag the corner handle to snap-resize. All only in edit mode.
 */
export function DashboardGrid({
  widgets,
  editing,
  workspaceId,
  slug,
  onChange,
  onOpenSettings,
}: {
  widgets: WidgetConfig[];
  editing: boolean;
  workspaceId: string;
  slug: string;
  onChange: (widgets: WidgetConfig[]) => void;
  onOpenSettings: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const resizeRef = useRef<{ id: string; startX: number; startY: number; startW: number; startH: number; colUnit: number } | null>(null);

  // ── Reorder ────────────────────────────────────────────────────────────────
  function reorder(fromId: string, toId: string) {
    if (fromId === toId) return;
    const from = widgets.findIndex((w) => w.id === fromId);
    const to = widgets.findIndex((w) => w.id === toId);
    if (from < 0 || to < 0) return;
    const next = [...widgets];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  }

  // ── Resize (pointer capture on a corner handle) ─────────────────────────────
  useEffect(() => {
    if (!editing) return;
    function move(e: PointerEvent) {
      const r = resizeRef.current;
      if (!r) return;
      const dx = e.clientX - r.startX;
      const dy = e.clientY - r.startY;
      const w = clamp(Math.round(r.startW + dx / r.colUnit), WIDGET_MIN_W, WIDGET_MAX_W);
      const h = clamp(Math.round(r.startH + dy / (ROW + GAP)), WIDGET_MIN_H, WIDGET_MAX_H);
      const cur = widgets.find((x) => x.id === r.id);
      if (!cur || (cur.w === w && cur.h === h)) return;
      onChange(widgets.map((x) => (x.id === r.id ? { ...x, w, h } : x)));
    }
    function up() {
      resizeRef.current = null;
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [editing, widgets, onChange]);

  function startResize(id: string, e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const cur = widgets.find((x) => x.id === id);
    const cw = containerRef.current?.clientWidth ?? 1200;
    if (!cur) return;
    resizeRef.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      startW: cur.w,
      startH: cur.h,
      colUnit: (cw + GAP) / GRID_COLS,
    };
  }

  return (
    <div
      ref={containerRef}
      className="grid w-full"
      style={{
        gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`,
        gridAutoRows: `${ROW}px`,
        gap: GAP,
      }}
    >
      {widgets.map((w) => (
        <div
          key={w.id}
          style={{
            gridColumn: `span ${clamp(w.w, WIDGET_MIN_W, WIDGET_MAX_W)}`,
            gridRow: `span ${clamp(w.h, WIDGET_MIN_H, WIDGET_MAX_H)}`,
          }}
          onDragOver={(e) => {
            if (!editing || !dragId) return;
            e.preventDefault();
            if (overId !== w.id) setOverId(w.id);
          }}
          onDrop={(e) => {
            if (!editing || !dragId) return;
            e.preventDefault();
            reorder(dragId, w.id);
            setDragId(null);
            setOverId(null);
          }}
          className={[
            "relative transition-[outline] duration-100",
            overId === w.id && dragId && dragId !== w.id ? "outline outline-2 outline-white/40 rounded-2xl" : "",
            dragId === w.id ? "opacity-40" : "",
          ].join(" ")}
        >
          <WidgetShell
            widget={w}
            editing={editing}
            workspaceId={workspaceId}
            slug={slug}
            onRemove={(id) => onChange(widgets.filter((x) => x.id !== id))}
            onOpenSettings={onOpenSettings}
            dragHandle={{
              draggable: editing,
              onDragStart: (e) => {
                e.dataTransfer.setData("text/plain", w.id);
                e.dataTransfer.effectAllowed = "move";
                setDragId(w.id);
              },
              onDragEnd: () => {
                setDragId(null);
                setOverId(null);
              },
            }}
            onResizePointerDown={(e) => startResize(w.id, e)}
          />
        </div>
      ))}
    </div>
  );
}
