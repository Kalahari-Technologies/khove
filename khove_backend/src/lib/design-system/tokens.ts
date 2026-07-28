/**
 * Khove Design System — B&W Token System
 *
 * Palette: strictly #000000 and #FFFFFF.
 * All depth, hierarchy, and muted states are expressed via white-on-black opacity.
 * Exception: task status dots use task.status.color from the database.
 */

export const tokens = {
  color: {
    base: "#000000",
    on: "#FFFFFF",
  },

  /**
   * Opacity scale — apply as Tailwind opacity modifiers on white/black.
   *
   * Dark mode usage:
   *   Surface:        bg-white/[0.04]
   *   Elevated:       bg-white/[0.07]
   *   Overlay:        bg-white/[0.10]
   *   Border:         border-white/[0.08]
   *   Border subtle:  border-white/[0.05]
   *   Text primary:   text-white
   *   Text secondary: text-white/60
   *   Text tertiary:  text-white/35
   *   Text disabled:  text-white/20
   */
  opacity: {
    surface: 0.04,
    elevated: 0.07,
    overlay: 0.10,
    border: 0.08,
    borderSubtle: 0.05,
    textPrimary: 1.0,
    textSecondary: 0.60,
    textTertiary: 0.35,
    textDisabled: 0.20,
  },

  radius: {
    sm: "6px",
    md: "8px",
    lg: "12px",
    xl: "16px",
    "2xl": "20px",
  },

  easing: {
    khove: "cubic-bezier(0.16, 1, 0.3, 1)",
    spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  },

  duration: {
    fast: "120ms",
    normal: "200ms",
    slow: "300ms",
  },

  font: {
    sans: "var(--font-geist-sans)",
    mono: "var(--font-geist-mono)",
    display: "var(--font-cal-sans)",
  },
} as const;

export type Tokens = typeof tokens;
