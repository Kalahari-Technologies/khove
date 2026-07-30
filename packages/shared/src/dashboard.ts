/**
 * Dashboard widget/layout contract — shared by the backend `dashboard` tRPC
 * router (zod validation of the persisted `widgets` blob) and the frontend
 * widget registry + grid. One source of truth for the layout shape.
 *
 * A Dashboard is an ordered array of widgets laid out in a 12-column flow grid.
 * Each widget carries only its span (`w`/`h`) — position is its array index —
 * so the layout is trivially serializable with no collision math.
 */

/** The catalog of widget types. Keep in sync with the frontend `WIDGET_REGISTRY`. */
export type WidgetType =
  // KPI
  | "kpi.row"
  | "kpi.single"
  // GitHub
  | "github.prPipeline"
  | "github.throughput"
  | "github.cycleTime"
  | "github.reviewLoad"
  | "github.milestones"
  | "github.repos"
  // Jira
  | "jira.sprintBurndown"
  | "jira.velocity"
  | "jira.epics"
  | "jira.statusDistribution"
  // Cross-tool
  | "cross.activity"
  | "cross.gaps"
  | "cross.threads"
  // Calendar / Planner
  | "calendar.agenda"
  | "calendar.today"
  | "calendar.insights"
  | "planner.deadlines"
  | "planner.overdue"
  // Agent / AI
  | "agent.proposals"
  | "ai.weeklyReport";

/** A single placed widget instance on a dashboard. */
export interface WidgetConfig {
  /** Stable instance id (crypto.randomUUID) — distinct from the widget `type`. */
  id: string;
  type: WidgetType;
  /** Column span, 1–12. */
  w: number;
  /** Row span, in ~88px grid rows. */
  h: number;
  /** Free-form per-widget settings (e.g. provider, windowDays, metricKey). */
  settings: Record<string, unknown>;
}

/** Grid geometry constants — shared so the router can clamp what the UI enforces. */
export const GRID_COLS = 12;
export const WIDGET_MIN_W = 1;
export const WIDGET_MAX_W = 12;
export const WIDGET_MIN_H = 1;
export const WIDGET_MAX_H = 8;

/** Hard cap on dashboards per (workspace, user) — enforced in the router. */
export const MAX_DASHBOARDS_PER_USER = 4;

/** Clamp a widget's span into the allowed grid range. */
export function clampWidget(w: number, h: number): { w: number; h: number } {
  return {
    w: Math.min(WIDGET_MAX_W, Math.max(WIDGET_MIN_W, Math.round(w))),
    h: Math.min(WIDGET_MAX_H, Math.max(WIDGET_MIN_H, Math.round(h))),
  };
}
