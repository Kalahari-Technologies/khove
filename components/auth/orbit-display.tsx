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
        const borderOpacity = 20 + i * 7;

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
              borderColor: `rgba(255, 255, 255, ${borderOpacity / 100})`,
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
            className="stroke-white/[0.45] stroke-[1.5px]"
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
          "absolute flex size-full transform-gpu animate-orbit items-center justify-center rounded-full border border-white/[0.15] bg-white/[0.08] [animation-delay:calc(var(--delay)*1000ms)]",
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
  // Inner ring — radius 100
  {
    src: "/assets/google-meet.svg",
    alt: "Google Meet",
    size: 30,
    className: "size-[30px] border-none bg-transparent",
    duration: 20,
    delay: 20,
    radius: 100,
    path: false,
    reverse: false,
  },
  {
    src: "/assets/slack.svg",
    alt: "Slack",
    size: 30,
    className: "size-[30px] border-none bg-transparent",
    duration: 20,
    delay: 10,
    radius: 100,
    path: false,
    reverse: false,
  },
  // Middle ring — radius 170
  {
    src: "/assets/github.svg",
    alt: "GitHub",
    size: 40,
    className: "size-[40px] border-none bg-transparent",
    duration: 20,
    delay: 0,
    radius: 170,
    path: false,
    reverse: true,
  },
  {
    src: "/assets/google-calendar.svg",
    alt: "Google Calendar",
    size: 40,
    className: "size-[40px] border-none bg-transparent",
    duration: 20,
    delay: 20,
    radius: 170,
    path: false,
    reverse: true,
  },
  {
    src: "/assets/zoom.svg",
    alt: "Zoom",
    size: 40,
    className: "size-[40px] border-none bg-transparent",
    duration: 20,
    delay: 10,
    radius: 170,
    path: false,
    reverse: true,
  },
  // Outer ring — radius 250
  {
    src: "/assets/jira.svg",
    alt: "Jira",
    size: 37,
    className: "size-[45px] border-none bg-transparent",
    duration: 20,
    delay: 0,
    radius: 250,
    path: false,
    reverse: false,
  },
  {
    src: "/assets/github.svg",
    alt: "GitHub",
    size: 45,
    className: "size-[45px] border-none bg-transparent",
    duration: 20,
    delay: 15,
    radius: 250,
    path: false,
    reverse: false,
  },
  {
    src: "/assets/atlassian.svg",
    alt: "Jira",
    size: 45,
    className: "size-[45px] border-none bg-transparent",
    duration: 20,
    delay: 30,
    radius: 250,
    path: false,
    reverse: false,
  },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export const OrbitDisplay = memo(function OrbitDisplay() {
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden">
      <Ripple mainCircleSize={100} />

      {/* Center text */}
      <span className="pointer-events-none whitespace-pre-wrap bg-gradient-to-b from-white to-white/10 bg-clip-text text-center text-7xl font-semibold leading-none text-transparent select-none">
        Khove
      </span>

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
            className="pointer-events-none"
            draggable={false}
          />
        </OrbitingCircles>
      ))}
    </div>
  );
});
