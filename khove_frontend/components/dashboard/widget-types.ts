import type { ComponentType, ElementType } from "react";
import type { WidgetType } from "@khove/shared";

/**
 * The widget contract shared by the registry, the grid, and every widget card.
 * A widget is a self-contained card that fetches its OWN data from `settings`.
 */
export interface WidgetProps {
  /** Free-form per-instance settings (provider, windowDays, metricKey, …). */
  settings: Record<string, unknown>;
  /** Active workspace id (for keying queries / links). */
  workspaceId: string;
  /** The workspace slug (for building in-app hrefs). */
  slug: string;
}

export type WidgetCategory = "KPI" | "GitHub" | "Jira" | "Cross-tool" | "Calendar" | "Agent" | "AI";

/** A declarative settings field, rendered by the settings popover. */
export interface SettingField {
  key: string;
  label: string;
  kind: "select" | "toggle" | "number";
  options?: { value: string | number; label: string }[];
  min?: number;
  max?: number;
  default?: string | number | boolean;
}

/** A catalog entry: metadata + the component used to render this widget type. */
export interface WidgetDef {
  type: WidgetType;
  title: string;
  description: string;
  category: WidgetCategory;
  icon: ElementType;
  component: ComponentType<WidgetProps>;
  defaultSize: { w: number; h: number };
  minW: number;
  minH: number;
  maxW: number;
  maxH: number;
  settingsSchema?: SettingField[];
}

/** Build the default settings object for a widget from its schema. */
export function defaultSettings(def: WidgetDef): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of def.settingsSchema ?? []) {
    if (f.default !== undefined) out[f.key] = f.default;
    else if (f.kind === "select" && f.options?.length) out[f.key] = f.options[0].value;
    else if (f.kind === "toggle") out[f.key] = false;
    else if (f.kind === "number" && f.min !== undefined) out[f.key] = f.min;
  }
  return out;
}
