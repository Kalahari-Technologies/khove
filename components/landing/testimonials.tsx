"use client";

import React from "react";
import { motion } from "motion/react";

/**
 * Social proof — a faithful port of the 21st.dev `testimonials-columns-1`
 * component by @sshahaider (three columns of cards auto-scrolling vertically at
 * different speeds behind a top/bottom fade mask), restyled to Khove's strict
 * B&W tokens. Avatars use the app's gradient-initial motif instead of photos.
 *
 * Placeholder quotes with fictional names — swap for real testimonials later.
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
  {
    quote:
      "One place to ask 'what needs my attention today' and actually get a real answer. It's become my morning ritual.",
    name: "Amara Bello",
    role: "Engineering Manager, Vertex",
    gradient: "from-indigo-500 to-purple-500",
  },
  {
    quote:
      "It turned my scattered issues, PRs and meetings into a plan I could trust. Less overhead, more shipping.",
    name: "Kenji Watanabe",
    role: "Tech Lead, Драйв",
    gradient: "from-teal-500 to-cyan-500",
  },
  {
    quote:
      "The conversational layer is the difference. My whole team just talks to it — no dashboards to learn.",
    name: "Lena Fischer",
    role: "Head of Product, Arc",
    gradient: "from-pink-500 to-rose-500",
  },
];

type Testimonial = (typeof TESTIMONIALS)[number];

function Avatar({ name, gradient }: { name: string; gradient: string }) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");
  return (
    <div
      className={`flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br ${gradient} text-[12px] font-semibold text-white`}
    >
      {initials}
    </div>
  );
}

function TestimonialsColumn({
  testimonials,
  duration = 10,
  className,
}: {
  testimonials: Testimonial[];
  duration?: number;
  className?: string;
}) {
  return (
    <div className={className}>
      <motion.div
        animate={{ translateY: "-50%" }}
        transition={{
          duration,
          repeat: Infinity,
          ease: "linear",
          repeatType: "loop",
        }}
        className="flex flex-col gap-6 pb-6"
      >
        {[...new Array(2)].map((_, dup) => (
          <React.Fragment key={dup}>
            {testimonials.map(({ quote, name, role, gradient }, i) => (
              <figure
                key={`${dup}-${i}`}
                className="w-full max-w-xs rounded-2xl border border-ink/[0.08] bg-ink/[0.02] p-6"
              >
                <blockquote className="text-[14px] leading-relaxed text-ink/70">
                  “{quote}”
                </blockquote>
                <figcaption className="mt-5 flex items-center gap-3">
                  <Avatar name={name} gradient={gradient} />
                  <div className="flex flex-col">
                    <div className="text-[13px] font-medium leading-5 tracking-tight text-ink">
                      {name}
                    </div>
                    <div className="text-[12px] leading-5 tracking-tight text-ink/40">
                      {role}
                    </div>
                  </div>
                </figcaption>
              </figure>
            ))}
          </React.Fragment>
        ))}
      </motion.div>
    </div>
  );
}

export function Testimonials() {
  const firstColumn = TESTIMONIALS.slice(0, 3);
  const secondColumn = TESTIMONIALS.slice(3, 6);
  const thirdColumn = TESTIMONIALS.slice(6, 9);

  return (
    <section className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="mx-auto max-w-2xl text-center"
      >
        <p className="mb-3 text-[12px] font-medium uppercase tracking-[0.2em] text-ink/35">
          Loved by builders
        </p>
        <h2 className="text-balance text-[clamp(1.9rem,4vw,3rem)] font-semibold leading-tight tracking-tight text-ink">
          Teams that stopped switching tabs
        </h2>
      </motion.div>

      <div className="mt-14 flex max-h-[740px] justify-center gap-6 overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_20%,black_80%,transparent)]">
        <TestimonialsColumn testimonials={firstColumn} duration={17} />
        <TestimonialsColumn
          testimonials={secondColumn}
          duration={21}
          className="hidden md:block"
        />
        <TestimonialsColumn
          testimonials={thirdColumn}
          duration={19}
          className="hidden lg:block"
        />
      </div>
    </section>
  );
}
