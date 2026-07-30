// A single source for provider/brand logos. Plain <img> (the app's convention for
// brand assets, all present under public/assets). Accepts source-style names
// (GITHUB, JIRA, GOOGLE_CALENDAR) or lowercase keys.

const ASSET: Record<string, string> = {
  github: "/assets/github.svg",
  jira: "/assets/jira.svg",
  atlassian: "/assets/atlassian.svg",
  google_calendar: "/assets/google-calendar.svg",
  google_meet: "/assets/google-meet.svg",
  slack: "/assets/slack.svg",
  zoom: "/assets/zoom.svg",
  notion: "/assets/notion.svg",
  gitlab: "/assets/gitlab.svg",
  figma: "/assets/figma.svg",
  khove: "/assets/khove-rounded.png",
};

function keyFor(provider: string): string {
  const p = provider.toLowerCase();
  if (p === "google" || p === "calendar") return "google_calendar";
  if (p === "meet") return "google_meet";
  return p;
}

export function ProviderIcon({
  provider,
  size = 14,
  className,
  title,
}: {
  provider: string | null | undefined;
  size?: number;
  className?: string;
  title?: string;
}) {
  if (!provider) return null;
  const src = ASSET[keyFor(provider)];
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={title ?? provider}
      title={title}
      width={size}
      height={size}
      draggable={false}
      className={className}
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  );
}
