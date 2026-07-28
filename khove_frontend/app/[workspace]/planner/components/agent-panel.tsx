"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Bot, ChevronDown } from "lucide-react";
import { AgentActionCard, type AgentActionView } from "@/components/agent/agent-action-card";

/**
 * Compact inline agent-actions panel on the planner (the second of the two
 * approval surfaces). Collapsed by default; links to the full Agent page.
 */
export function PlannerAgentPanel({ actions, slug }: { actions: AgentActionView[]; slug: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="px-6 pt-3">
      <div className="rounded-xl border border-teal-400/15 bg-teal-400/[0.03] overflow-hidden">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-3 w-full px-4 py-2.5 text-left"
        >
          <Bot size={14} className="text-teal-300 flex-shrink-0" />
          <span className="text-[13px] font-medium text-white/85">
            {actions.length} suggestion{actions.length === 1 ? "" : "s"} to review
          </span>
          <Link
            href={`/${slug}/agent`}
            onClick={(e) => e.stopPropagation()}
            className="text-[11px] text-teal-300/80 hover:text-teal-200 transition-colors ml-auto flex-shrink-0"
          >
            Open Agent
          </Link>
          <ChevronDown size={13} className={`text-white/40 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="border-t border-teal-400/10"
            >
              <div className="p-3 space-y-2.5 max-h-[320px] overflow-y-auto">
                {actions.slice(0, 4).map((a) => (
                  <AgentActionCard key={a.id} action={a} compact />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
