export interface GradientPreset {
  key: string;
  label: string;
  css: string;
}

export const WORKSPACE_GRADIENTS: GradientPreset[] = [
  { key: "sunset",   label: "Sunset",   css: "radial-gradient(circle at 30% 70%, #F97316, #F43F5E, #EC4899)" },
  { key: "aurora",   label: "Aurora",   css: "radial-gradient(circle at 30% 70%, #10B981, #6366F1, #8B5CF6)" },
  { key: "ocean",    label: "Ocean",    css: "radial-gradient(circle at 30% 70%, #0EA5E9, #06B6D4, #0891B2)" },
  { key: "ember",    label: "Ember",    css: "radial-gradient(circle at 30% 70%, #F59E0B, #F97316, #F43F5E)" },
  { key: "forest",   label: "Forest",   css: "radial-gradient(circle at 30% 70%, #10B981, #14B8A6, #0EA5E9)" },
  { key: "berry",    label: "Berry",    css: "radial-gradient(circle at 30% 70%, #8B5CF6, #EC4899, #F43F5E)" },
  { key: "citrus",   label: "Citrus",   css: "radial-gradient(circle at 30% 70%, #84CC16, #F59E0B, #F97316)" },
  { key: "arctic",   label: "Arctic",   css: "radial-gradient(circle at 30% 70%, #06B6D4, #0EA5E9, #6366F1)" },
  { key: "rose",     label: "Rose",     css: "radial-gradient(circle at 30% 70%, #F43F5E, #EC4899, #8B5CF6)" },
  { key: "mint",     label: "Mint",     css: "radial-gradient(circle at 30% 70%, #34D399, #10B981, #0EA5E9)" },
  { key: "dawn",     label: "Dawn",     css: "radial-gradient(circle at 30% 70%, #FB923C, #F59E0B, #EAB308)" },
  { key: "lavender", label: "Lavender", css: "radial-gradient(circle at 30% 70%, #A78BFA, #8B5CF6, #6366F1)" },
  { key: "coral",    label: "Coral",    css: "radial-gradient(circle at 30% 70%, #FB7185, #F43F5E, #E11D48)" },
  { key: "sage",     label: "Sage",     css: "radial-gradient(circle at 30% 70%, #4ADE80, #22C55E, #10B981)" },
  { key: "dusk",     label: "Dusk",     css: "radial-gradient(circle at 30% 70%, #6366F1, #7C3AED, #EC4899)" },
  { key: "slate",    label: "Slate",    css: "radial-gradient(circle at 30% 70%, #94A3B8, #64748B, #475569)" },
];

const gradientMap = new Map(WORKSPACE_GRADIENTS.map((g) => [g.key, g.css]));

/**
 * Get the CSS background value for a gradient preset key.
 * Falls back to "slate" if the key is not found.
 */
export function getGradientStyle(key: string): string {
  return gradientMap.get(key) ?? gradientMap.get("slate")!;
}

/**
 * Pick a random gradient key (excluding "slate").
 */
export function randomGradientKey(): string {
  const options = WORKSPACE_GRADIENTS.filter((g) => g.key !== "slate");
  return options[Math.floor(Math.random() * options.length)].key;
}
