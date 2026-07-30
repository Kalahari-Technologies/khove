"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  Copy,
  LayoutDashboard,
  Pencil,
  Plus,
  RefreshCw,
  Star,
  Trash2,
} from "lucide-react";
import type { WidgetConfig } from "@khove/shared";
import { MAX_DASHBOARDS_PER_USER } from "@khove/shared";
import { trpc } from "@/lib/trpc/client";
import { useLocalPref } from "@/lib/dashboard/use-local-pref";
import { defaultSettings } from "@/components/dashboard/widget-types";
import { WIDGET_REGISTRY } from "@/components/dashboard/widget-registry";
import { DashboardGrid } from "@/components/dashboard/grid/dashboard-grid";
import { useGridPersistence } from "@/components/dashboard/grid/use-grid-persistence";
import { WidgetCatalogDrawer } from "@/components/dashboard/widget-catalog-drawer";
import { WidgetSettingsPopover } from "@/components/dashboard/widget-settings-popover";

interface DashboardListItem {
  id: string;
  name: string;
  isDefault: boolean;
  widgetCount: number;
}

export function DashboardClient({
  workspaceId,
  slug,
  canWrite,
  dashboard,
  dashboards,
}: {
  workspaceId: string;
  slug: string;
  canWrite: boolean;
  dashboard: { id: string; name: string; icon: string | null; isDefault: boolean; widgets: WidgetConfig[] };
  dashboards: DashboardListItem[];
}) {
  const router = useRouter();
  const utils = trpc.useUtils();

  const [widgets, setWidgets] = useState<WidgetConfig[]>(dashboard.widgets);
  const [editing, setEditing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useLocalPref<boolean>(
    workspaceId ? `dash:autorefresh:${workspaceId}` : null,
    true,
  );
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(() => Date.now());
  const [nowTick, setNowTick] = useState(() => Date.now());

  const { save } = useGridPersistence(dashboard.id);

  // Re-sync local widgets when navigating to a different dashboard.
  useEffect(() => {
    setWidgets(dashboard.widgets);
    setEditing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboard.id]);

  // Auto-refresh: invalidate all widget queries on an interval.
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => {
      utils.invalidate();
      setLastRefresh(Date.now());
    }, 60_000);
    return () => clearInterval(id);
  }, [autoRefresh, utils]);

  // Tick so "Refreshed Xm ago" stays current.
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  function updateWidgets(next: WidgetConfig[]) {
    setWidgets(next);
    save(next);
  }

  function addWidget(type: keyof typeof WIDGET_REGISTRY) {
    const def = WIDGET_REGISTRY[type];
    updateWidgets([
      ...widgets,
      { id: crypto.randomUUID(), type: def.type, w: def.defaultSize.w, h: def.defaultSize.h, settings: defaultSettings(def) },
    ]);
    setCatalogOpen(false);
  }

  const settingsWidget = useMemo(() => widgets.find((w) => w.id === settingsId) ?? null, [widgets, settingsId]);

  const refreshedLabel = useMemo(() => {
    const s = Math.max(0, Math.floor((nowTick - lastRefresh) / 1000));
    if (s < 60) return "just now";
    const m = Math.floor(s / 60);
    return `${m}m ago`;
  }, [nowTick, lastRefresh]);

  // ── Dashboard-level mutations ────────────────────────────────────────────────
  const createM = trpc.dashboard.create.useMutation({
    onSuccess: (r) => {
      utils.dashboard.list.invalidate();
      router.push(`/${slug}/dashboards/${r.id}`);
    },
  });
  const deleteM = trpc.dashboard.delete.useMutation({
    onSuccess: () => {
      utils.dashboard.list.invalidate();
      const next = dashboards.find((d) => d.id !== dashboard.id);
      router.push(next ? `/${slug}/dashboards/${next.id}` : `/${slug}/dashboards`);
    },
  });
  const dupM = trpc.dashboard.duplicate.useMutation({
    onSuccess: (r) => {
      utils.dashboard.list.invalidate();
      router.push(`/${slug}/dashboards/${r.id}`);
    },
  });
  const defaultM = trpc.dashboard.setDefault.useMutation({
    onSuccess: () => {
      utils.dashboard.list.invalidate();
      router.refresh();
    },
  });
  const renameM = trpc.dashboard.update.useMutation({
    onSuccess: () => {
      utils.dashboard.list.invalidate();
      router.refresh();
    },
  });

  const atLimit = dashboards.length >= MAX_DASHBOARDS_PER_USER;

  return (
    <div className="flex h-full flex-col">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-3">
        <div className="flex items-center gap-2">
          {/* Dashboard switcher */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setSwitcherOpen((v) => !v)}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.05]"
            >
              <LayoutDashboard size={16} className="text-white/50" />
              <span className="text-[15px] font-semibold text-white/90">{dashboard.name}</span>
              {dashboard.isDefault && <Star size={12} className="fill-amber-300 text-amber-300" />}
              <ChevronDown size={14} className="text-white/40" />
            </button>
            {switcherOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setSwitcherOpen(false)} />
                <div className="absolute left-0 top-full z-20 mt-1 w-60 rounded-xl border border-white/[0.1] bg-[#0d0d0f] p-1.5 shadow-2xl">
                  {dashboards.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => {
                        setSwitcherOpen(false);
                        if (d.id !== dashboard.id) router.push(`/${slug}/dashboards/${d.id}`);
                      }}
                      className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left hover:bg-white/[0.06]"
                    >
                      <span className="flex items-center gap-2 text-[13px] text-white/80">
                        {d.name}
                        {d.isDefault && <Star size={11} className="fill-amber-300 text-amber-300" />}
                      </span>
                      {d.id === dashboard.id && <Check size={13} className="text-white/50" />}
                    </button>
                  ))}
                  {canWrite && (
                    <button
                      type="button"
                      disabled={atLimit || createM.isPending}
                      onClick={() => {
                        setSwitcherOpen(false);
                        createM.mutate({ name: `Dashboard ${dashboards.length + 1}` });
                      }}
                      className="mt-1 flex w-full items-center gap-2 rounded-lg border-t border-white/[0.06] px-2.5 py-2 text-[13px] text-white/70 hover:bg-white/[0.06] disabled:opacity-40"
                    >
                      <Plus size={13} />
                      {atLimit ? `Max ${MAX_DASHBOARDS_PER_USER} dashboards` : "New dashboard"}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1.5 text-[11.5px] text-white/35 sm:flex">
            <RefreshCw size={12} />
            Refreshed {refreshedLabel}
          </span>
          <button
            type="button"
            onClick={() => setAutoRefresh((v) => !v)}
            className={`rounded-lg border px-2.5 py-1.5 text-[12px] transition-colors ${
              autoRefresh ? "border-emerald-400/25 text-emerald-300" : "border-white/[0.1] text-white/45"
            }`}
          >
            Auto-refresh: {autoRefresh ? "On" : "Off"}
          </button>

          {canWrite && (
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/[0.1] px-2.5 py-1.5 text-[12px] text-white/60">
              <span>Edit</span>
              <button
                type="button"
                onClick={() => setEditing((v) => !v)}
                className={`relative h-5 w-9 rounded-full transition-colors ${editing ? "bg-indigo-500/70" : "bg-white/10"}`}
                aria-pressed={editing}
              >
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${editing ? "left-[18px]" : "left-0.5"}`} />
              </button>
            </label>
          )}

          {editing && (
            <>
              <button
                type="button"
                onClick={() => setCatalogOpen(true)}
                className="flex items-center gap-1.5 rounded-lg bg-white/[0.1] px-3 py-1.5 text-[12.5px] font-medium text-white/90 hover:bg-white/[0.16]"
              >
                <Plus size={14} />
                Add widget
              </button>
              <ManageMenu
                isDefault={dashboard.isDefault}
                atLimit={atLimit}
                onRename={() => setRenaming(true)}
                onSetDefault={() => defaultM.mutate({ id: dashboard.id })}
                onDuplicate={() => dupM.mutate({ id: dashboard.id })}
                onDelete={() => {
                  if (confirm(`Delete "${dashboard.name}"? This can't be undone.`)) deleteM.mutate({ id: dashboard.id });
                }}
              />
            </>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto p-5">
        {widgets.length === 0 ? (
          <div className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
            <LayoutDashboard size={28} className="text-white/20" />
            <p className="text-[14px] text-white/50">This dashboard is empty.</p>
            {canWrite && (
              <button
                type="button"
                onClick={() => {
                  setEditing(true);
                  setCatalogOpen(true);
                }}
                className="mt-1 flex items-center gap-1.5 rounded-lg bg-white/[0.1] px-3.5 py-2 text-[13px] font-medium text-white/90 hover:bg-white/[0.16]"
              >
                <Plus size={15} />
                Add your first widget
              </button>
            )}
          </div>
        ) : (
          <DashboardGrid
            widgets={widgets}
            editing={editing}
            workspaceId={workspaceId}
            slug={slug}
            onChange={updateWidgets}
            onOpenSettings={setSettingsId}
          />
        )}
      </div>

      <WidgetCatalogDrawer open={catalogOpen} onClose={() => setCatalogOpen(false)} onAdd={(def) => addWidget(def.type)} />
      {settingsWidget && (
        <WidgetSettingsPopover
          widget={settingsWidget}
          onClose={() => setSettingsId(null)}
          onSave={(settings) => {
            updateWidgets(widgets.map((w) => (w.id === settingsWidget.id ? { ...w, settings } : w)));
            setSettingsId(null);
          }}
        />
      )}
      {renaming && (
        <RenameDialog
          initial={dashboard.name}
          onClose={() => setRenaming(false)}
          onSave={(name) => {
            renameM.mutate({ id: dashboard.id, name });
            setRenaming(false);
          }}
        />
      )}
    </div>
  );
}

function ManageMenu({
  isDefault,
  atLimit,
  onRename,
  onSetDefault,
  onDuplicate,
  onDelete,
}: {
  isDefault: boolean;
  atLimit: boolean;
  onRename: () => void;
  onSetDefault: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg border border-white/[0.1] px-2 py-1.5 text-white/55 hover:bg-white/[0.06]"
      >
        <ChevronDown size={14} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-xl border border-white/[0.1] bg-[#0d0d0f] p-1.5 shadow-2xl">
            <MenuItem icon={<Pencil size={13} />} label="Rename" onClick={() => { setOpen(false); onRename(); }} />
            {!isDefault && (
              <MenuItem icon={<Star size={13} />} label="Set as default" onClick={() => { setOpen(false); onSetDefault(); }} />
            )}
            <MenuItem
              icon={<Copy size={13} />}
              label={atLimit ? "Duplicate (at limit)" : "Duplicate"}
              disabled={atLimit}
              onClick={() => { setOpen(false); onDuplicate(); }}
            />
            <MenuItem icon={<Trash2 size={13} />} label="Delete" danger onClick={() => { setOpen(false); onDelete(); }} />
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] hover:bg-white/[0.06] disabled:opacity-40 ${
        danger ? "text-red-300 hover:bg-red-500/10" : "text-white/75"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function RenameDialog({ initial, onClose, onSave }: { initial: string; onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl border border-white/[0.1] bg-[#0d0d0f] p-5 shadow-2xl">
        <h2 className="mb-3 text-[14px] font-semibold text-white/85">Rename dashboard</h2>
        <input
          ref={ref}
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) onSave(name.trim());
          }}
          className="w-full rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-[13px] text-white/85 outline-none focus:border-white/25"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-[12.5px] text-white/50 hover:text-white/80">
            Cancel
          </button>
          <button
            type="button"
            disabled={!name.trim()}
            onClick={() => onSave(name.trim())}
            className="rounded-lg bg-white/[0.1] px-3.5 py-1.5 text-[12.5px] font-medium text-white/90 hover:bg-white/[0.16] disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
