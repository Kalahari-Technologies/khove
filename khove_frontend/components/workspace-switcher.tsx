"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { ChevronsUpDown, Check, Plus } from "lucide-react";
import { getGradientStyle } from "@/lib/workspace/gradients";

const ease = "cubic-bezier(0.16, 1, 0.3, 1)";

interface WorkspaceItem {
  id: string;
  slug: string;
  name: string;
  isPersonal: boolean;
  role: string;
  gradient: string;
  planTier: string;
}

interface WorkspaceSwitcherProps {
  current: { id: string; slug: string; name: string; isPersonal: boolean; gradient: string };
  workspaces: WorkspaceItem[];
  onCreateNew?: () => void;
}

function GradientAvatar({ gradient, size = 28 }: { gradient: string; size?: number }) {
  return (
    <div
      className="rounded-full flex-shrink-0"
      style={{
        width: size,
        height: size,
        background: getGradientStyle(gradient),
      }}
    />
  );
}

export function WorkspaceSwitcher({ current, workspaces, onCreateNew }: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Get current section to preserve on switch
  const currentSection = (() => {
    const prefix = `/${current.slug}`;
    const relative = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : "/chat";
    return relative || "/chat";
  })();

  function handleSwitch(ws: WorkspaceItem) {
    setOpen(false);
    if (ws.id !== current.id) {
      router.push(`/${ws.slug}${currentSection}`);
    }
  }

  const displayName = current.name;

  return (
    <div ref={ref} className="relative w-full">
      {/* Trigger */}
      <button
        onClick={() => setOpen(!open)}
        data-state={open ? "open" : "closed"}
        className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg border border-white/[0.08] hover:bg-white/[0.04] transition-colors duration-[120ms]"
        style={{ transitionTimingFunction: ease }}
      >
        <GradientAvatar gradient={current.gradient} size={24} />
        <span className="flex-1 text-left text-[13px] font-medium text-white/90 truncate">
          {displayName}
        </span>
        <ChevronsUpDown
          size={14}
          strokeWidth={2}
          className="text-white/30 flex-shrink-0"
        />
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="absolute left-0 top-full mt-1.5 w-full min-w-[240px] bg-[#111113] border border-white/[0.10] rounded-xl shadow-2xl z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="px-3 py-2.5 border-b border-white/[0.07]">
              <p className="text-[12px] font-medium text-white/40">Workspaces</p>
            </div>

            {/* List */}
            <div className="max-h-[280px] overflow-y-auto p-1">
              {workspaces.map((ws) => {
                const isSelected = ws.id === current.id;
                const wsName = ws.name;

                return (
                  <button
                    key={ws.id}
                    onClick={() => handleSwitch(ws)}
                    className={`flex items-center gap-2.5 w-full px-2.5 py-2.5 rounded-lg text-left transition-colors duration-[100ms] ${
                      isSelected
                        ? "bg-white/[0.06]"
                        : "hover:bg-white/[0.04]"
                    }`}
                    style={{ transitionTimingFunction: ease }}
                  >
                    <GradientAvatar gradient={ws.gradient} size={28} />

                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-white/90 truncate leading-tight">
                        {wsName}
                      </p>
                      <p className="text-[11px] text-white/35 leading-tight mt-0.5">
                        {ws.planTier}
                      </p>
                    </div>

                    {isSelected && (
                      <Check size={15} strokeWidth={2.5} className="text-white/60 flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Footer — create workspace */}
            <div className="border-t border-white/[0.07] p-1">
              <button
                onClick={() => {
                  setOpen(false);
                  onCreateNew?.();
                }}
                className="flex items-center gap-2.5 w-full px-2.5 py-2.5 rounded-lg text-left hover:bg-white/[0.04] transition-colors duration-[100ms]"
                style={{ transitionTimingFunction: ease }}
              >
                <div className="flex items-center justify-center w-7 h-7 rounded-full border border-dashed border-white/[0.20] flex-shrink-0">
                  <Plus size={13} strokeWidth={2} className="text-white/40" />
                </div>
                <span className="text-[13px] text-white/50">Create workspace</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
