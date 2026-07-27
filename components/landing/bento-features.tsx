"use client";

import {
  MessageSquare,
  GitPullRequest,
  CalendarDays,
  Brain,
  Users,
  Zap,
} from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { ACCENTS } from "./constants";
import { useLandingTheme } from "./theme";

/**
 * Feature bento — the FeatureCard / FeatureTitle / FeatureDescription pattern
 * and the md:grid-cols-6 col-span bento layout are adapted from 21st.dev's
 * "Feature Section with Bento Grid" (@manuarora700 / aceternity, id 979).
 * Everything else is rewritten to Khove's B&W system with hand-built skeletons
 * (the original's cobe globe / tabler icons deps are dropped) and each icon
 * gets a low-opacity accent glow — the page's subtle colour signature.
 */

function GlowIcon({
  icon: Icon,
  color,
}: {
  icon: typeof MessageSquare;
  color: string;
}) {
  const { theme } = useLandingTheme();
  const light = theme === "light";

  return (
    <div className="relative inline-flex self-start">
      {/* transparent accent bloom — the glow/shadow, both themes */}
      <div
        className="absolute inset-0 rounded-lg blur-md"
        style={{ backgroundColor: color, opacity: light ? 0.4 : 0.35 }}
      />
      {/* light: solid accent fill + white icon · dark: original glass chip */}
      <div
        className={cn(
          "relative flex h-9 w-9 items-center justify-center rounded-lg border",
          light ? "border-white/10" : "border-ink/[0.08] bg-ink/[0.05]"
        )}
        style={light ? { backgroundColor: color } : undefined}
      >
        <Icon
          className={cn("h-[18px] w-[18px]", light ? "text-white" : "text-ink")}
          strokeWidth={1.75}
        />
      </div>
    </div>
  );
}

function Cell({
  className,
  icon,
  color,
  title,
  description,
  children,
}: {
  className?: string;
  icon: typeof MessageSquare;
  color: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "group relative flex flex-col overflow-hidden border-ink/[0.06] p-6 sm:p-8",
        className
      )}
    >
      <GlowIcon icon={icon} color={color} />
      <h3 className="mt-4 text-[17px] font-medium tracking-tight text-ink">
        {title}
      </h3>
      <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-ink/50">
        {description}
      </p>
      {children ? <div className="mt-6 flex-1">{children}</div> : null}
    </motion.div>
  );
}

// ─── Skeletons (pure B&W mock UI) ─────────────────────────────────────────────

function ChatSkeleton() {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="ml-auto max-w-[80%] rounded-lg rounded-br-sm bg-ink/[0.06] px-3 py-2 text-[12px] text-ink/70">
        What&apos;s blocking the release?
      </div>
      <div className="max-w-[90%] rounded-lg rounded-bl-sm border border-ink/[0.06] bg-ink/[0.02] px-3 py-2 text-[12px] text-ink/60">
        3 PRs are open on <span className="text-ink/80">web</span>. #482 is
        approved, #479 needs review, #471 has failing checks. Want me to ping the
        reviewers?
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-ink/30">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink/40" />
        Khove is thinking…
      </div>
    </div>
  );
}

function GithubSkeleton() {
  const prs = [
    { id: "#482", label: "Approved", tone: "text-emerald-400/80" },
    { id: "#479", label: "Review", tone: "text-ink/40" },
    { id: "#471", label: "Checks failing", tone: "text-rose-400/80" },
  ];
  return (
    <div className="flex flex-col gap-2">
      {prs.map((pr) => (
        <div
          key={pr.id}
          className="flex items-center gap-2.5 rounded-lg border border-ink/[0.06] bg-ink/[0.02] px-3 py-2"
        >
          <GitPullRequest className="h-3.5 w-3.5 text-ink/40" />
          <span className="text-[12px] text-ink/70">{pr.id}</span>
          <span className={cn("ml-auto text-[11px]", pr.tone)}>{pr.label}</span>
        </div>
      ))}
    </div>
  );
}

function CalendarSkeleton() {
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {Array.from({ length: 20 }).map((_, i) => {
        const busy = [3, 7, 8, 12, 16].includes(i);
        return (
          <div
            key={i}
            className={cn(
              "h-6 rounded-[5px] border",
              busy
                ? "border-transparent bg-ink/[0.14]"
                : "border-ink/[0.05] bg-ink/[0.02]"
            )}
          />
        );
      })}
    </div>
  );
}

function MemorySkeleton() {
  const chips = ["Prefers concise replies", "Ships on Fridays", "Owns web repo"];
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c) => (
        <span
          key={c}
          className="rounded-full border border-ink/[0.07] bg-ink/[0.03] px-2.5 py-1 text-[11px] text-ink/55"
        >
          {c}
        </span>
      ))}
    </div>
  );
}

export function BentoFeatures() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-balance text-[clamp(1.9rem,4vw,3rem)] font-semibold leading-tight tracking-tight text-ink">
          One workspace. Every tool.
          <br className="hidden sm:block" /> One conversation.
        </h2>
        <p className="mt-4 text-balance text-[16px] leading-relaxed text-ink/50">
          Stop stitching context together by hand. Khove reads across your
          tools and acts on them — from a single prompt.
        </p>
      </div>

      <div className="mt-14 grid grid-cols-1 overflow-hidden rounded-2xl border border-ink/[0.08] md:grid-cols-6">
        <Cell
          className="border-b md:col-span-4 md:border-r"
          icon={MessageSquare}
          color={ACCENTS.chat}
          title="Just ask. Khove does the rest."
          description="A conversational interface over all your tools. Ask in plain English; Khove routes the request, pulls the context and takes the action — creating tasks, checking availability, opening issues."
        >
          <ChatSkeleton />
        </Cell>

        <Cell
          className="border-b md:col-span-2"
          icon={Brain}
          color={ACCENTS.jira}
          title="Remembers what matters"
          description="Persistent memory learns how you work and carries context between conversations."
        >
          <MemorySkeleton />
        </Cell>

        <Cell
          className="border-b md:col-span-3 md:border-r"
          icon={GitPullRequest}
          color={ACCENTS.github}
          title="GitHub, in the loop"
          description="Pull requests, issues and repo activity — surfaced and summarised so nothing slips."
        >
          <GithubSkeleton />
        </Cell>

        <Cell
          className="border-b md:col-span-3 md:border-b-0"
          icon={CalendarDays}
          color={ACCENTS.planner}
          title="Your calendar, planned"
          description="Google Calendar synced two-way. Khove finds the time and blocks it for you."
        >
          <CalendarSkeleton />
        </Cell>

        <Cell
          className="border-b md:col-span-3 md:border-b-0 md:border-r"
          icon={Users}
          color={ACCENTS.tasks}
          title="Built for teams"
          description="Workspace-scoped by design. Invite your team, share memory and standups, keep every integration in its own space."
        />

        <Cell
          className="md:col-span-3"
          icon={Zap}
          color={ACCENTS.chat}
          title="Fast by default"
          description="A smart router sends simple asks to a fast model and hard ones to a stronger one — so you get speed without paying for it everywhere."
        />
      </div>
    </section>
  );
}
