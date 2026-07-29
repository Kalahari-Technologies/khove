"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface SubnavTab {
  label: string;
  href: string;
}

/** Thin tab strip for per-integration sub-navigation (real routes). */
export function IntegrationSubnav({ tabs }: { tabs: SubnavTab[] }) {
  const pathname = usePathname();
  return (
    <div className="flex shrink-0 items-center gap-0.5 border-b border-white/[0.06] px-6 xl:px-10">
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`relative px-3 py-2.5 text-[13px] transition-colors ${
              active ? "text-white" : "text-white/45 hover:text-white/75"
            }`}
          >
            {t.label}
            {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-white/80" />}
          </Link>
        );
      })}
    </div>
  );
}
