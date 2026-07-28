"use client";

import { memo, forwardRef, useState } from "react";
import { motion, useMotionTemplate, useMotionValue } from "motion/react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

const ease = "cubic-bezier(0.16, 1, 0.3, 1)";

interface AuthInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const AuthInput = memo(
  forwardRef<HTMLInputElement, AuthInputProps>(function AuthInput(
    { className, type, label, error, ...props },
    ref
  ) {
    const radius = 100;
    const [visible, setVisible] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);

    function handleMouseMove({
      currentTarget,
      clientX,
      clientY,
    }: React.MouseEvent<HTMLDivElement>) {
      const { left, top } = currentTarget.getBoundingClientRect();
      mouseX.set(clientX - left);
      mouseY.set(clientY - top);
    }

    const isPassword = type === "password";
    const inputType = isPassword ? (showPassword ? "text" : "password") : type;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label className="text-[11px] font-medium text-white/50 uppercase tracking-wide">
            {label} {props.required && <span className="text-red-400">*</span>}
          </label>
        )}

        <motion.div
          style={{
            background: useMotionTemplate`
              radial-gradient(
                ${visible ? radius + "px" : "0px"} circle at ${mouseX}px ${mouseY}px,
                rgba(255, 255, 255, 0.15),
                transparent 80%
              )
            `,
          }}
          onMouseMove={handleMouseMove}
          onMouseEnter={() => setVisible(true)}
          onMouseLeave={() => setVisible(false)}
          className="group/input rounded-lg p-[1px] transition duration-300"
        >
          <div className="relative">
            <input
              type={inputType}
              ref={ref}
              className={cn(
                "w-full h-9 px-3 rounded-lg bg-white/[0.05] text-[13px] text-white",
                "placeholder:text-white/30 transition-colors duration-[120ms]",
                "focus:outline-none focus:ring-1 focus:ring-white/20",
                "border-none",
                isPassword && "pr-10",
                className
              )}
              style={{ transitionTimingFunction: ease }}
              {...props}
            />
            {isPassword && (
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-white/30 hover:text-white/60 transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <Eye size={15} /> : <EyeOff size={15} />}
              </button>
            )}
          </div>
        </motion.div>

        {error && (
          <p className="text-[11px] text-red-400">{error}</p>
        )}
      </div>
    );
  })
);
