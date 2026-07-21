"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { CtaButton } from "./cta-button";

const LINKS = [
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Pricing", href: "#pricing" },
];

/**
 * Floating top nav — inspired by 21st.dev's floating-navbar (id 1146):
 * a translucent bar that gains a blur + border once the page is scrolled.
 * Restyled to Khove's B&W tokens.
 */
export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4"
    >
      <nav
        className={cn(
          "flex w-full max-w-5xl items-center justify-between rounded-xl px-4 py-2.5 transition-all duration-300",
          scrolled
            ? "border border-white/[0.08] bg-[#09090B]/70 backdrop-blur-xl"
            : "border border-transparent bg-transparent"
        )}
        style={{ transitionTimingFunction: "cubic-bezier(0.16,1,0.3,1)" }}
      >
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2">
          <img
            src="/assets/khove-white.png"
            alt="Khove"
            width={24}
            height={24}
            className="h-6 w-6 object-contain"
          />
          <span className="text-[15px] font-semibold tracking-tight text-white">
            Khove
          </span>
        </Link>

        {/* Center links */}
        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-1.5 text-[13px] text-white/60 transition-colors hover:text-white"
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Auth actions */}
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="hidden rounded-lg px-3 py-1.5 text-[13px] text-white/70 transition-colors hover:text-white sm:block"
          >
            Log in
          </Link>
          <CtaButton href="/join" size="sm">
            Get started
          </CtaButton>
        </div>
      </nav>
    </motion.header>
  );
}
