"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useLocalPref } from "@/lib/dashboard/use-local-pref";

export interface TabDef {
  key: string;
  label: string;
  icon?: ReactNode;
  count?: number;
}

/**
 * A sticky, client-side tab bar for the integration dashboards. The active tab is
 * persisted per-workspace (localStorage) and mirrored to a `?tab=` query param for
 * shareable links — but tabs are NOT real routes (same server-fetched data set).
 */
export function DashboardTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDef[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-xl border border-white/[0.07] bg-white/[0.02] p-1">
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={[
              "relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors",
              on ? "bg-white/[0.08] text-white/90" : "text-white/45 hover:text-white/70",
            ].join(" ")}
          >
            {t.icon}
            {t.label}
            {t.count != null && t.count > 0 && (
              <span className="ml-0.5 rounded-full bg-white/10 px-1.5 text-[10px] tabular-nums text-white/60">
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Hook that manages the active-tab state: hydrates from `?tab=` (highest priority)
 * then localStorage, and writes back to both on change.
 */
export function useDashboardTabs(
  storageKey: string | null,
  tabKeys: string[],
  fallback: string,
): [string, (k: string) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [stored, setStored] = useLocalPref<string>(storageKey, fallback);

  const urlTab = params.get("tab");
  const active = urlTab && tabKeys.includes(urlTab) ? urlTab : tabKeys.includes(stored) ? stored : fallback;

  // Keep the URL param in sync with the resolved tab (shallow replace, no scroll jump).
  useEffect(() => {
    if (urlTab === active) return;
    const p = new URLSearchParams(params.toString());
    p.set("tab", active);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const set = (k: string) => {
    setStored(k);
    const p = new URLSearchParams(params.toString());
    p.set("tab", k);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };

  return [active, set];
}
