/** The 5 per-nav accent glow colors from components/app-sidebar.tsx.
 *  On the landing they appear only as low-opacity blurred glows and faint
 *  washes — never as solid fills. This is the "subtle signature" over the
 *  strict black-and-white base. */
export const ACCENTS = {
  chat: "#8B5CF6", // violet
  tasks: "#0EA5E9", // ocean blue
  planner: "#F43F5E", // rose
  github: "#10B981", // emerald
  jira: "#6366F1", // indigo
} as const;

/** The khove easing curve, for inline `transitionTimingFunction`. */
export const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
