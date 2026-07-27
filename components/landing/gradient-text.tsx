import { cn } from "@/lib/utils";

/**
 * Gradient headline text rendered as SVG — NOT CSS `background-clip: text`.
 *
 * Why: `-webkit-background-clip: text` can silently drop out (invisible text)
 * when the clipped element sits on a GPU compositing layer, which some browsers
 * (e.g. Brave) hit even after removing transforms/blends. SVG fills text with
 * `fill="url(#gradient)"` natively — no clip, no webkit, no compositing
 * dependency — so it paints identically everywhere.
 *
 * Responsive: the SVG scales to its container width (cap it with a `max-w-*` in
 * `className`); the font scales with it. Accessible via role="img" + aria-label.
 */
export function GradientText({
  lines,
  className,
  weightClassName = "font-semibold tracking-tight",
  from = "rgb(var(--ink) / 1)",
  to = "rgb(var(--ink) / 0.55)",
}: {
  lines: string[];
  className?: string;
  weightClassName?: string;
  from?: string;
  to?: string;
}) {
  const FS = 100; // font size in viewBox units
  const LH = 1.05 * FS; // line height
  // Generous glyph-advance estimate so the viewBox always contains the text
  // (prevents horizontal clipping/overflow); extra width just pads the sides,
  // and text-anchor=middle keeps it centered.
  const CHAR_W = 0.62 * FS;
  const PAD_Y = 0.28 * FS; // room for descenders (g, y) so nothing clips
  const maxChars = Math.max(...lines.map((l) => l.length));
  const width = Math.ceil(maxChars * CHAR_W);
  const height = Math.ceil(lines.length * LH + PAD_Y);
  // deterministic, collision-resistant gradient id (no Math.random for SSR)
  const gid = `gt-${lines.join("-").replace(/[^a-z0-9]/gi, "").slice(0, 16)}-${width}`;

  return (
    <svg
      role="img"
      aria-label={lines.join(" ")}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      className={cn("block h-auto w-full", className)}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          {/* stop-color set via `style` (not the attribute) so the `--ink`
              CSS var resolves — SVG presentation attributes don't evaluate
              var(), but the CSS property does. This is what lets the headline
              re-theme with the landing's light/dark toggle. */}
          <stop offset="0%" style={{ stopColor: from }} />
          <stop offset="100%" style={{ stopColor: to }} />
        </linearGradient>
      </defs>
      <text
        textAnchor="middle"
        fill={`url(#${gid})`}
        className={weightClassName}
        style={{ fontSize: FS, fontFamily: "var(--font-geist-sans), sans-serif" }}
      >
        {lines.map((line, i) => (
          <tspan key={i} x="50%" y={Math.round(LH * (i + 0.82))}>
            {line}
          </tspan>
        ))}
      </text>
    </svg>
  );
}
