import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Landing theme tokens — the base "ink" (foreground) and "paper"
        // (background) resolve from CSS vars so the landing can switch between
        // dark and light by swapping the vars (see globals.css). Alpha is
        // preserved, so `text-ink/60`, `bg-ink/[0.04]`, `border-ink/[0.08]`
        // all work exactly like the old white-on-black tokens.
        ink: "rgb(var(--ink) / <alpha-value>)",
        paper: "rgb(var(--paper) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "Inter Variable", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "Fira Code", "monospace"],
        display: ["var(--font-cal-sans)", "var(--font-geist-sans)", "sans-serif"],
      },
      transitionTimingFunction: {
        "khove": "cubic-bezier(0.16, 1, 0.3, 1)",
        "spring": "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      transitionDuration: {
        "fast": "120ms",
        "normal": "200ms",
        "slow": "300ms",
      },
      borderRadius: {
        "sm": "6px",
        "md": "8px",
        "lg": "12px",
        "xl": "16px",
      },
      animation: {
        ripple: "ripple 2s ease calc(var(--i, 0) * 0.2s) infinite",
        orbit: "orbit calc(var(--duration) * 1s) linear infinite",
        marquee: "marquee var(--marquee-duration, 40s) linear infinite",
      },
      keyframes: {
        marquee: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
        ripple: {
          "0%, 100%": { transform: "translate(-50%, -50%) scale(1)" },
          "50%": { transform: "translate(-50%, -50%) scale(0.9)" },
        },
        orbit: {
          "0%": {
            transform:
              "rotate(0deg) translateY(calc(var(--radius) * 1px)) rotate(0deg)",
          },
          "100%": {
            transform:
              "rotate(360deg) translateY(calc(var(--radius) * 1px)) rotate(-360deg)",
          },
        },
      },
    },
  },
  plugins: [],
};

export default config;
