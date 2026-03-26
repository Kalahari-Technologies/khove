import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
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
    },
  },
  plugins: [],
};

export default config;
