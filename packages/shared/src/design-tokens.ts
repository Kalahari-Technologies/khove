/**
 * Khove Design System — B&W Token System (shared, framework-free).
 * Palette: strictly #000000 and #FFFFFF; depth via white-on-black opacity.
 */
export const tokens = {
  color: {
    base: "#000000",
    on: "#FFFFFF",
  },
  opacity: {
    surface: 0.04,
    elevated: 0.07,
    overlay: 0.1,
    border: 0.08,
    borderSubtle: 0.05,
    textPrimary: 1.0,
    textSecondary: 0.6,
    textTertiary: 0.35,
    textDisabled: 0.2,
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
