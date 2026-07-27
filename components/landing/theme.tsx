"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { motion, AnimatePresence } from "motion/react";
import { Sun, Moon } from "lucide-react";

type Theme = "dark" | "light";
const STORAGE_KEY = "khove-landing-theme";

const LandingThemeContext = createContext<{
  theme: Theme;
  toggle: () => void;
}>({ theme: "dark", toggle: () => {} });

export function useLandingTheme() {
  return useContext(LandingThemeContext);
}

/**
 * Scopes the landing's dark/light theme. Renders the `.landing-root` wrapper
 * that carries the `data-theme` used by the `--ink` / `--paper` CSS vars, so
 * only the landing subtree re-themes (the authed app stays dark-only).
 *
 * SSR renders the default (`dark`) to match the first client paint; the stored
 * preference is applied after mount (a brief flash for returning light-mode
 * visitors, but no hydration mismatch).
 */
export function LandingThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "light" || stored === "dark") setTheme(stored);
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return (
    <LandingThemeContext.Provider value={{ theme, toggle }}>
      <div className="landing-root" data-theme={theme}>
        {children}
      </div>
    </LandingThemeContext.Provider>
  );
}

/** Sun/Moon theme switch — drop into the nav. */
export function ThemeToggle() {
  const { theme, toggle } = useLandingTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-ink/[0.08] bg-ink/[0.03] text-ink/70 transition-colors hover:text-ink"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          initial={{ opacity: 0, rotate: -90, scale: 0.6 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={{ opacity: 0, rotate: 90, scale: 0.6 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-0 flex items-center justify-center"
        >
          {isDark ? (
            <Sun className="h-4 w-4" strokeWidth={1.75} />
          ) : (
            <Moon className="h-4 w-4" strokeWidth={1.75} />
          )}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
