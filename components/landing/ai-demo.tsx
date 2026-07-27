"use client";

import { motion, type Variants } from "motion/react";
import {
  GitPullRequest,
  CalendarDays,
  ListChecks,
  ArrowRight,
} from "lucide-react";
import { ACCENTS } from "./constants";

/**
 * Cross-context demo — "One question. Every context." A hand-built, animated
 * mock of a Khove conversation that reads across GitHub, Calendar and Tasks and
 * answers in one shot. Built in the 21st.dev "animated chat / conversation
 * demo" idiom (staggered message + tool-chip reveals via motion/react),
 * restyled to Khove's B&W tokens with the 5-accent signature on the tool chips.
 *
 * Illustrative content — not a live product surface (a revamp may follow).
 */

const container: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.14, delayChildren: 0.1 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
  },
};

const TOOL_CALLS = [
  { icon: GitPullRequest, label: "Scanned 3 repos", color: ACCENTS.github },
  { icon: CalendarDays, label: "Read today's calendar", color: ACCENTS.planner },
  { icon: ListChecks, label: "Reviewed 8 tasks", color: ACCENTS.tasks },
];

function ToolChip({
  icon: Icon,
  label,
  color,
}: {
  icon: typeof GitPullRequest;
  label: string;
  color: string;
}) {
  return (
    <motion.div
      variants={item}
      className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/60"
    >
      <Icon className="h-3 w-3" style={{ color }} strokeWidth={2} />
      {label}
    </motion.div>
  );
}

/** A priority line in the agent's answer, with an accent status dot. */
function AnswerLine({
  color,
  children,
}: {
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="text-[13px] leading-relaxed text-white/70">
        {children}
      </span>
    </div>
  );
}

export function AiDemo() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-2xl text-center">
        <p className="mb-3 text-[12px] font-medium uppercase tracking-[0.2em] text-white/35">
          See it think
        </p>
        <h2 className="text-balance text-[clamp(1.9rem,4vw,3rem)] font-semibold leading-tight tracking-tight text-white">
          One question. Every context.
        </h2>
        <p className="mt-4 text-balance text-[16px] leading-relaxed text-white/50">
          Ask once. Khove reads across GitHub, your calendar and your tasks —
          then answers with what actually matters, and offers to act on it.
        </p>
      </div>

      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={container}
        className="relative mx-auto mt-14 max-w-2xl overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]"
      >
        {/* accent wash */}
        <div
          className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[140%] -translate-x-1/2 blur-[90px]"
          style={{
            background: `radial-gradient(ellipse at center, ${ACCENTS.chat}22, transparent 70%)`,
          }}
        />

        {/* Window chrome */}
        <div className="relative flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-white/[0.12]" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/[0.12]" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/[0.12]" />
          </div>
          <span className="ml-2 text-[12px] text-white/40">
            Khove · web workspace
          </span>
        </div>

        <div className="relative flex flex-col gap-4 p-5 sm:p-7">
          {/* User message */}
          <motion.div variants={item} className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl rounded-br-md bg-white/[0.06] px-4 py-2.5 text-[13px] text-white/80">
              What needs my attention before standup?
            </div>
          </motion.div>

          {/* Tool calls */}
          <motion.div variants={item} className="flex flex-wrap gap-2">
            {TOOL_CALLS.map((t) => (
              <ToolChip key={t.label} {...t} />
            ))}
          </motion.div>

          {/* Agent answer */}
          <motion.div variants={item} className="flex justify-start">
            <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-white/[0.06] bg-white/[0.02] px-4 py-3.5">
              <p className="mb-3 text-[13px] text-white/55">
                Here&apos;s your morning, in priority order:
              </p>
              <div className="flex flex-col gap-2.5">
                <AnswerLine color={ACCENTS.planner}>
                  <span className="text-white/85">PR #471</span> on{" "}
                  <span className="text-white/85">web</span> has failing checks —
                  it blocks the 2:00 PM release.
                </AnswerLine>
                <AnswerLine color={ACCENTS.chat}>
                  Task <span className="text-white/85">“API sync”</span> is due
                  today and still in progress.
                </AnswerLine>
                <AnswerLine color={ACCENTS.tasks}>
                  Standup at 9:30, then you&apos;re free until noon — a good block
                  for the fix.
                </AnswerLine>
              </div>
              <p className="mt-3.5 text-[13px] leading-relaxed text-white/70">
                Want me to open an issue for the failing checks and block
                10:00–12:00 to fix them?
              </p>
            </div>
          </motion.div>

          {/* Suggested actions */}
          <motion.div variants={item} className="flex flex-wrap gap-2 pl-1">
            <button className="group inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-[12px] font-medium text-black transition-colors hover:bg-white/90">
              Yes, do both
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </button>
            <button className="rounded-lg border border-white/[0.10] bg-white/[0.03] px-3.5 py-2 text-[12px] font-medium text-white/70 transition-colors hover:bg-white/[0.06]">
              Just the issue
            </button>
          </motion.div>
        </div>
      </motion.div>
    </section>
  );
}
