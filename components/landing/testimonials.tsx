"use client";

import { motion } from "motion/react";

/**
 * Placeholder social proof — illustrative quotes with fictional names.
 * Swap for real testimonials once available. Kept strictly B&W; avatars use
 * the app's gradient-initial motif.
 */
const TESTIMONIALS = [
  {
    quote:
      "Khove replaced the three tabs I lived in. I ask one question and get the whole picture across GitHub and my calendar.",
    name: "Maya Okafor",
    role: "Staff Engineer, Northwind",
    gradient: "from-violet-500 to-indigo-500",
  },
  {
    quote:
      "Standups write themselves now. It already knows what shipped, what's blocked and what's on my calendar.",
    name: "Devin Park",
    role: "Eng Lead, Loop",
    gradient: "from-emerald-500 to-teal-500",
  },
  {
    quote:
      "The memory is the killer feature. It remembers how I like things and stops asking me the same setup questions.",
    name: "Sara Lindqvist",
    role: "Founder, Kettle",
    gradient: "from-rose-500 to-orange-500",
  },
  {
    quote:
      "Onboarded the whole team in an afternoon. Workspace-scoped integrations meant no messy shared credentials.",
    name: "Tomás Rivera",
    role: "CTO, Beacon",
    gradient: "from-sky-500 to-blue-500",
  },
  {
    quote:
      "It's fast. Simple asks come back instantly, and the hard ones still get a genuinely smart answer.",
    name: "Priya Nair",
    role: "PM, Cadence",
    gradient: "from-fuchsia-500 to-pink-500",
  },
  {
    quote:
      "Finally, calendar and code in the same conversation. I plan my week and file the issues without leaving the chat.",
    name: "Julian Weber",
    role: "Solo dev",
    gradient: "from-amber-500 to-yellow-500",
  },
];

function Avatar({ name, gradient }: { name: string; gradient: string }) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");
  return (
    <div
      className={`flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br ${gradient} text-[12px] font-semibold text-white`}
    >
      {initials}
    </div>
  );
}

export function Testimonials() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-2xl text-center">
        <p className="mb-3 text-[12px] font-medium uppercase tracking-[0.2em] text-white/35">
          Loved by builders
        </p>
        <h2 className="text-balance text-[clamp(1.9rem,4vw,3rem)] font-semibold leading-tight tracking-tight text-white">
          Teams that stopped switching tabs
        </h2>
      </div>

      <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TESTIMONIALS.map((t, i) => (
          <motion.figure
            key={t.name}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.5, delay: (i % 3) * 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col justify-between rounded-xl border border-white/[0.08] bg-white/[0.02] p-6 transition-colors hover:bg-white/[0.04]"
          >
            <blockquote className="text-[14px] leading-relaxed text-white/70">
              “{t.quote}”
            </blockquote>
            <figcaption className="mt-6 flex items-center gap-3">
              <Avatar name={t.name} gradient={t.gradient} />
              <div>
                <div className="text-[13px] font-medium text-white">{t.name}</div>
                <div className="text-[12px] text-white/40">{t.role}</div>
              </div>
            </figcaption>
          </motion.figure>
        ))}
      </div>
    </section>
  );
}
