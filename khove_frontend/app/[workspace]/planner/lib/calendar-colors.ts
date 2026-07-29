// Calendar color system — apportions a rich color to an item by a selectable
// "Color by" dimension. Important items (tasks/meetings) use these; calendar
// entries (holidays etc.) use a separate muted color so the two never clash.

export type ColorBy = "source" | "status" | "priority";

export const COLOR_BY_OPTIONS: { key: ColorBy; label: string }[] = [
  { key: "source", label: "Source" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
];

const SOURCE_COLOR: Record<string, string> = {
  GOOGLE_CALENDAR: "#F43F5E", // rose — meetings
  JIRA: "#6366F1", // indigo
  GITHUB: "#10B981", // emerald
  KHOVE: "#0EA5E9", // sky
  AI: "#8B5CF6", // violet
};

const PRIORITY_COLOR: Record<string, string> = {
  URGENT: "#F43F5E",
  HIGH: "#F59E0B",
  MEDIUM: "#0EA5E9",
  LOW: "#64748B",
};

/** Muted, deliberately-distinct color for non-important calendar entries. */
export const ENTRY_COLOR = "#8B5CF6";

const FALLBACK = "#64748B";

export interface ColorableTask {
  source: string[];
  status: { color: string };
  priority?: string;
}

export function colorForTask(t: ColorableTask, by: ColorBy): string {
  if (by === "status") return t.status.color || FALLBACK;
  if (by === "priority") return PRIORITY_COLOR[(t.priority ?? "MEDIUM").toUpperCase()] ?? FALLBACK;
  const s = t.source.find((x) => SOURCE_COLOR[x]) ?? "KHOVE";
  return SOURCE_COLOR[s] ?? FALLBACK;
}
