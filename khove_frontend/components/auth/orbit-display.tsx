"use client";

import { memo } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

// ─── Ripple ───────────────────────────────────────────────────────────────────

function Ripple({
  mainCircleSize = 210,
  mainCircleOpacity = 0.24,
  numCircles = 11,
}: {
  mainCircleSize?: number;
  mainCircleOpacity?: number;
  numCircles?: number;
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center [mask-image:linear-gradient(to_bottom,white,transparent)]">
      {Array.from({ length: numCircles }, (_, i) => {
        const size = mainCircleSize + i * 70;
        const opacity = mainCircleOpacity - i * 0.03;
        const animationDelay = `${i * 0.06}s`;
        const borderStyle = i === numCircles - 1 ? "dashed" : "solid";
        const borderOpacity = 40 + i * 5;

        return (
          <span
            key={i}
            className="absolute animate-ripple rounded-full border"
            style={{
              width: `${size}px`,
              height: `${size}px`,
              opacity,
              animationDelay,
              borderStyle,
              borderWidth: "1px",
              borderColor: `rgb(var(--ink) / ${borderOpacity / 100})`,
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
            }}
          />
        );
      })}
    </div>
  );
}

// ─── OrbitingCircles ──────────────────────────────────────────────────────────

function OrbitingCircles({
  className,
  children,
  reverse = false,
  duration = 20,
  delay = 10,
  radius = 50,
  path = true,
}: {
  className?: string;
  children: React.ReactNode;
  reverse?: boolean;
  duration?: number;
  delay?: number;
  radius?: number;
  path?: boolean;
}) {
  return (
    <>
      {path && (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="pointer-events-none absolute inset-0 size-full"
        >
          <circle
            className="stroke-ink/[0.7] stroke-[1.5px]"
            cx="50%"
            cy="50%"
            r={radius}
            fill="none"
          />
        </svg>
      )}
      <div
        style={
          {
            "--duration": duration,
            "--radius": radius,
            "--delay": -delay,
          } as React.CSSProperties
        }
        className={cn(
          "absolute flex size-full transform-gpu animate-orbit items-center justify-center rounded-full border border-ink/[0.15] bg-ink/[0.08] [animation-delay:calc(var(--delay)*1000ms)]",
          reverse && "[animation-direction:reverse]",
          className
        )}
      >
        {children}
      </div>
    </>
  );
}

// ─── Icon configs ─────────────────────────────────────────────────────────────

const ORBIT_ICONS = [
  // Ring 1 — radius 90 (innermost, 2 icons)
  {
    src: "/assets/google-meet.svg",
    alt: "Google Meet",
    size: 28,
    className: "size-[30px] border-none bg-transparent",
    duration: 22,
    delay: 0,
    radius: 90,
    path: false,
    reverse: false,
  },
  {
    src: "/assets/slack.svg",
    alt: "Slack",
    size: 28,
    className: "size-[30px] border-none bg-transparent",
    duration: 22,
    delay: 11,
    radius: 90,
    path: false,
    reverse: false,
  },
  // Ring 2 — radius 155 (3 icons, reverse)
  {
    src: "/assets/google-calendar.svg",
    alt: "Google Calendar",
    size: 25,
    className: "size-[38px] border-none bg-transparent",
    duration: 26,
    delay: 0,
    radius: 155,
    path: false,
    reverse: true,
  },
  {
    src: "/assets/notion.svg",
    alt: "Notion",
    size: 25,
    className: "size-[38px] border-none bg-transparent",
    duration: 26,
    delay: 13,
    radius: 155,
    path: false,
    reverse: true,
  },
  // Ring 3 — radius 220 (4 icons)
  {
    src: "/assets/figma.svg",
    alt: "Figma",
    size: 28,
    className: "size-[42px] border-none bg-transparent",
    duration: 30,
    delay: 7.5,
    radius: 220,
    path: false,
    reverse: false,
  },
  {
    src: "/assets/microsoft-teams.svg",
    alt: "Teams",
    size: 28,
    className: "size-[42px] border-none bg-transparent",
    duration: 30,
    delay: 10,
    radius: 220,
    path: false,
    reverse: false,
  },
  {
    src: "/assets/azure.svg",
    alt: "Azure",
    size: 28,
    className: "size-[42px] border-none bg-transparent",
    duration: 30,
    delay: 20,
    radius: 220,
    path: false,
    reverse: false,
  },
  // Ring 4 — radius 290 (outermost, 3 icons, reverse)
  {
    src: "/assets/github.svg",
    alt: "GitHub",
    size: 30,
    className: "size-[45px] border-none bg-transparent",
    duration: 34,
    delay: 0,
    radius: 290,
    path: false,
    reverse: true,
  },
  {
    src: "/assets/atlassian.svg",
    alt: "Atlassian",
    size: 30,
    className: "size-[45px] border-none bg-transparent",
    duration: 34,
    delay: 11.3,
    radius: 290,
    path: false,
    reverse: true,
  },
  {
    src: "/assets/gitlab.svg",
    alt: "GitLab",
    size: 30,
    className: "size-[45px] border-none bg-transparent",
    duration: 34,
    delay: 22.7,
    radius: 290,
    path: false,
    reverse: true,
  },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export const OrbitDisplay = memo(function OrbitDisplay() {
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden">
      <Ripple mainCircleSize={100} />

      {/* Center text */}
      <img src="/assets/khove-white.png" alt="Khove" width={100} height={100} className="khove-mark" />

      {/* Orbiting icons */}
      {ORBIT_ICONS.map((icon, index) => (
        <OrbitingCircles
          key={index}
          className={icon.className}
          duration={icon.duration}
          delay={icon.delay}
          radius={icon.radius}
          path={icon.path}
          reverse={icon.reverse}
        >
          <Image
            src={icon.src}
            alt={icon.alt}
            width={icon.size}
            height={icon.size}
            className={`pointer-events-none${
              icon.alt === "GitHub" || icon.alt === "Notion"
                ? " tint-black-in-light"
                : ""
            }`}
            draggable={false}
          />
        </OrbitingCircles>
      ))}
    </div>
  );
});
