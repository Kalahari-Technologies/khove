"use client";

const INTEGRATIONS = [
  { src: "/assets/github.svg", alt: "GitHub" },
  { src: "/assets/google-calendar.svg", alt: "Google Calendar" },
  { src: "/assets/jira.svg", alt: "Jira" },
  { src: "/assets/slack.svg", alt: "Slack" },
  { src: "/assets/notion.svg", alt: "Notion" },
  { src: "/assets/figma.svg", alt: "Figma" },
  { src: "/assets/gitlab.svg", alt: "GitLab" },
  { src: "/assets/google-meet.svg", alt: "Google Meet" },
  { src: "/assets/microsoft-teams.svg", alt: "Microsoft Teams" },
  { src: "/assets/zoom.svg", alt: "Zoom" },
  { src: "/assets/atlassian.svg", alt: "Atlassian" },
  { src: "/assets/azure.svg", alt: "Azure" },
];

/**
 * Integrations marquee — a continuously scrolling row of the tools Khove
 * connects, built from the repo's own SVGs in public/assets. The track is
 * duplicated and translated -50% so the loop is seamless; edges are masked.
 */
export function IntegrationsMarquee() {
  const row = [...INTEGRATIONS, ...INTEGRATIONS];

  return (
    <section className="relative border-y border-ink/[0.06] py-14">
      <p className="mb-9 text-center text-[12px] font-medium uppercase tracking-[0.2em] text-ink/35">
        Connects the tools you already use
      </p>

      <div className="group relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
        <div className="flex w-max animate-marquee items-center gap-16 pr-16 group-hover:[animation-play-state:paused]">
          {row.map((item, i) => {
            // github.svg / notion.svg are white marks — invisible on light
            // paper, so tint them black in light mode (see globals.css).
            const tintDark = item.alt === "GitHub" || item.alt === "Notion";
            return (
              <img
                key={`${item.alt}-${i}`}
                src={item.src}
                alt={item.alt}
                width={30}
                height={30}
                className={`h-7 w-7 shrink-0 opacity-45 grayscale transition-all duration-300 hover:opacity-100 hover:grayscale-0 sm:h-8 sm:w-8${
                  tintDark ? " tint-black-in-light" : ""
                }`}
                draggable={false}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}
