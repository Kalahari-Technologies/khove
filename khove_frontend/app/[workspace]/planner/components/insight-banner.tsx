"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, Brain, CalendarClock, Clock, ChevronDown, X } from "lucide-react";

export interface PlannerInsight {
  id: string;
  type: "conflict" | "focus_gap" | "overload";
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string;
  day: string;
}

const ICONS: Record<PlannerInsight["type"], typeof AlertTriangle> = {
  conflict: AlertTriangle,
  focus_gap: Clock,
  overload: CalendarClock,
};

const SEVERITY: Record<PlannerInsight["severity"], { dot: string; text: string }> = {
  critical: { dot: "bg-red-400", text: "text-red-300" },
  warning: { dot: "bg-amber-400", text: "text-amber-300" },
  info: { dot: "bg-white/40", text: "text-white/60" },
};

/**
 * Proactive time-intelligence banner — surfaces calendar conflicts, unprotected
 * focus time, and overloaded days above the planner. Read-only in Stage B; Stage
 * D adds Approve/Reject on the actionable ones.
 */
export function InsightBanner({ insights }: { insights: PlannerInsight[] }) {
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || insights.length === 0) return null;

  const top = insights[0];
  const rest = insights.slice(1);
  const TopIcon = ICONS[top.type];

  return (
    <div className="px-6 pt-3">
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] overflow-hidden">
        {/* Primary row */}
        <div className="flex items-center gap-3 px-4 py-2.5">
          <div className="flex items-center gap-2 flex-shrink-0">
            <Brain size={14} className="text-white/40" />
            <span className={`w-1.5 h-1.5 rounded-full ${SEVERITY[top.severity].dot}`} />
          </div>
          <TopIcon size={14} className={SEVERITY[top.severity].text} />
          <div className="flex items-baseline gap-2 min-w-0 flex-1">
            <span className="text-[13px] font-medium text-white/85 flex-shrink-0">{top.title}</span>
            <span className="text-[12px] text-white/45 truncate">{top.detail}</span>
          </div>
          {rest.length > 0 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1 text-[11px] text-white/50 hover:text-white/80 transition-colors flex-shrink-0"
            >
              {rest.length} more
              <ChevronDown size={12} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>
          )}
          <button
            onClick={() => setDismissed(true)}
            className="text-white/30 hover:text-white/60 transition-colors flex-shrink-0"
            aria-label="Dismiss insights"
          >
            <X size={13} />
          </button>
        </div>

        {/* Expanded list */}
        <AnimatePresence initial={false}>
          {expanded && rest.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="border-t border-white/[0.06]"
            >
              {rest.map((i) => {
                const Icon = ICONS[i.type];
                return (
                  <div key={i.id} className="flex items-center gap-3 px-4 py-2 border-b border-white/[0.04] last:border-0">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${SEVERITY[i.severity].dot}`} />
                    <Icon size={13} className={`flex-shrink-0 ${SEVERITY[i.severity].text}`} />
                    <span className="text-[12px] font-medium text-white/75 flex-shrink-0">{i.title}</span>
                    <span className="text-[12px] text-white/40 truncate">{i.detail}</span>
                  </div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
