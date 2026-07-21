import Link from "next/link";
import { cn } from "@/lib/utils";
import { BottomGradient } from "./bottom-gradient";
import { EASE } from "./constants";

/**
 * The landing's primary/secondary buttons, matching the auth pages:
 * primary = solid `bg-white text-black`, secondary = bordered glass.
 * Both carry the BottomGradient hover accent.
 */
export function CtaButton({
  href,
  children,
  variant = "primary",
  size = "md",
  className,
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    sm: "h-9 px-4 text-[13px]",
    md: "h-10 px-5 text-[13px]",
    lg: "h-12 px-7 text-[14px]",
  };

  return (
    <Link
      href={href}
      className={cn(
        "group/btn relative inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors active:scale-[0.98]",
        sizes[size],
        variant === "primary"
          ? "bg-white text-black hover:bg-white/90"
          : "border border-white/[0.10] bg-white/[0.03] text-white/80 hover:bg-white/[0.06]",
        className
      )}
      style={{ transitionTimingFunction: EASE }}
    >
      {children}
      <BottomGradient />
    </Link>
  );
}
