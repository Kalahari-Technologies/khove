"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ListChecks,
  CalendarDays,
  GitPullRequest,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCENTS } from "./constants";

/**
 * Agent actions — "From ask to action." An interactive tabbed showcase of what
 * Khove's agent actually does, grouped by integration. Each row is an example
 * prompt → the real tool it calls (the 13 workspace-scoped tools from the AI
 * system), with the resulting action. Built in the 21st.dev "tabbed feature
 * showcase" idiom (animated tab panels via motion/react), in Khove B&W with the
 * per-integration accent signature.
 *
 * Illustrative content — not a live product surface (a revamp may follow).
 */

type Action = { prompt: string; tool: string; result: string };

const TABS: {
  key: string;
  label: string;
  icon: LucideIcon;
  color: string;
  actions: Action[];
}[] = [
  {
    key: "tasks",
    label: "Tasks & Planning",
    icon: ListChecks,
    color: ACCENTS.tasks,
    actions: [
      {
        prompt: "Add a task to fix the login bug, high priority",
        tool: "createTask",
        result: "“Fix login bug” · High · due today",
      },
      {
        prompt: "What's on my plate this week?",
        tool: "listTasks",
        result: "8 open · 3 due soon",
      },
      {
        prompt: "Mark the API sync task as done",
        tool: "updateTask",
        result: "API sync → Done",
      },
      {
        prompt: "Drop the duplicate onboarding task",
        tool: "deleteTask",
        result: "Cancelled · archived",
      },
    ],
  },
  {
    key: "calendar",
    label: "Calendar",
    icon: CalendarDays,
    color: ACCENTS.planner,
    actions: [
      {
        prompt: "Block two hours tomorrow for deep work",
        tool: "createCalendarEvent",
        result: "Deep work · 10:00–12:00",
      },
      {
        prompt: "Am I free Thursday afternoon?",
        tool: "checkAvailability",
        result: "Free after 2:00 PM",
      },
      {
        prompt: "What's coming up today?",
        tool: "listUpcomingEvents",
        result: "3 events · next at 9:30",
      },
    ],
  },
  {
    key: "github",
    label: "GitHub",
    icon: GitPullRequest,
    color: ACCENTS.github,
    actions: [
      {
        prompt: "Any PRs waiting on me?",
        tool: "listPullRequests",
        result: "3 open · #482 approved",
      },
      {
        prompt: "Summarise PR #482",
        tool: "getPullRequest",
        result: "Auth refactor · +214 −57",
      },
      {
        prompt: "Open an issue: checkout throws on empty cart",
        tool: "createGitHubIssue",
        result: "#128 opened on web",
      },
      {
        prompt: "What changed in web this week?",
        tool: "getRepoActivity",
        result: "12 commits · 4 merged",
      },
    ],
  },
];

export function AgentActions() {
  const [active, setActive] = useState(0);
  const tab = TABS[active];

  return (
    <section className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-2xl text-center">
        <p className="mb-3 text-[12px] font-medium uppercase tracking-[0.2em] text-ink/35">
          Agent actions
        </p>
        <h2 className="text-balance text-[clamp(1.9rem,4vw,3rem)] font-semibold leading-tight tracking-tight text-ink">
          From ask to action
        </h2>
        <p className="mt-4 text-balance text-[16px] leading-relaxed text-ink/50">
          Khove doesn&apos;t just answer — it does the work. Every request maps
          to a real, workspace-scoped tool call across your stack.
        </p>
      </div>

      {/* Tabs */}
      <div className="mt-12 flex flex-wrap justify-center gap-2">
        {TABS.map((t, i) => {
          const selected = i === active;
          return (
            <button
              key={t.key}
              onClick={() => setActive(i)}
              className={cn(
                "relative inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] transition-colors",
                selected
                  ? "border-ink/[0.14] text-ink"
                  : "border-ink/[0.06] text-ink/50 hover:text-ink/80"
              )}
            >
              {selected && (
                <motion.span
                  layoutId="agent-tab-glow"
                  className="absolute inset-0 rounded-full"
                  style={{ backgroundColor: `${t.color}1f` }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                />
              )}
              <t.icon
                className="relative h-4 w-4"
                style={{ color: selected ? t.color : undefined }}
                strokeWidth={2}
              />
              <span className="relative">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Panel */}
      <div className="mx-auto mt-8 max-w-3xl">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab.key}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col gap-3"
          >
            {tab.actions.map((a) => (
              <div
                key={a.tool}
                className="grid items-center gap-3 rounded-xl border border-ink/[0.07] bg-ink/[0.02] p-4 transition-colors hover:bg-ink/[0.035] sm:grid-cols-[1fr_auto_1fr]"
              >
                <p className="text-[13px] text-ink/70">“{a.prompt}”</p>
                <ArrowRight className="hidden h-4 w-4 text-ink/25 sm:block" />
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="rounded-md border px-2 py-0.5 font-mono text-[11px]"
                    style={{
                      color: tab.color,
                      borderColor: `${tab.color}40`,
                      backgroundColor: `${tab.color}14`,
                    }}
                  >
                    {a.tool}
                  </span>
                  <span className="text-[12px] text-ink/55">{a.result}</span>
                </div>
              </div>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
