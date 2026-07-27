import Link from "next/link";
import { cn } from "@/lib/utils";
import { BottomGradient } from "./bottom-gradient";
import { EASE } from "./constants";

/**
 * The landing's primary/secondary buttons, matching the auth pages:
 * primary = solid `bg-ink text-paper`, secondary = bordered glass.
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
          ? "bg-ink text-paper hover:bg-ink/90"
          : "border border-ink/[0.10] bg-ink/[0.03] text-ink/80 hover:bg-ink/[0.06]",
        className
      )}
      style={{ transitionTimingFunction: EASE }}
    >
      {children}
      <BottomGradient />
    </Link>
  );
}
