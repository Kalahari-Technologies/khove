"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  Plus,
  ArrowUpDown,
  Home,
  LayoutList,
  Columns,
  Calendar,
} from "lucide-react";

import type { TaskWithStatus, WorkflowStatus } from "@/lib/types";
import { ConfirmDialog } from "@/components/confirm-dialog";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TasksClientProps {
  tasks: TaskWithStatus[];
  statuses: WorkflowStatus[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ITEMS_PER_PAGE = 12;

const PRIORITY_ORDER: Record<string, number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

const SVG_PATHS = [
  "M720 450C720 450 742.459 440.315 755.249 425.626C768.039 410.937 778.88 418.741 789.478 401.499C800.076 384.258 817.06 389.269 826.741 380.436C836.423 371.603 851.957 364.826 863.182 356.242C874.408 347.657 877.993 342.678 898.867 333.214C919.741 323.75 923.618 319.88 934.875 310.177C946.133 300.474 960.784 300.837 970.584 287.701C980.384 274.564 993.538 273.334 1004.85 263.087C1016.15 252.84 1026.42 250.801 1038.22 242.1C1050.02 233.399 1065.19 230.418 1074.63 215.721",
  "M720 450C720 450 741.044 435.759 753.062 410.636C765.079 385.514 770.541 386.148 782.73 370.489C794.918 354.83 799.378 353.188 811.338 332.597C823.298 312.005 825.578 306.419 843.707 295.493C861.837 284.568 856.194 273.248 877.376 256.48C898.558 239.713 887.536 227.843 909.648 214.958C931.759 202.073 925.133 188.092 941.063 177.621",
  "M720 450C720 450 712.336 437.768 690.248 407.156C668.161 376.544 672.543 394.253 665.951 365.784C659.358 337.316 647.903 347.461 636.929 323.197C625.956 298.933 626.831 303.639 609.939 281.01C593.048 258.381 598.7 255.282 582.342 242.504C565.985 229.726 566.053 217.66 559.169 197.116",
  "M720 450C720 450 738.983 448.651 790.209 446.852C841.436 445.052 816.31 441.421 861.866 437.296C907.422 433.172 886.273 437.037 930.656 436.651C975.04 436.264 951.399 432.343 1001.57 425.74C1051.73 419.138 1020.72 425.208 1072.85 424.127",
  "M720 450C720 450 696.366 458.841 682.407 472.967C668.448 487.093 673.23 487.471 647.919 492.882C622.608 498.293 636.85 499.899 609.016 512.944C581.182 525.989 596.778 528.494 571.937 533.778C547.095 539.062 551.762 548.656 536.862 556.816",
  "M720 450C720 450 695.644 482.465 682.699 506.197C669.755 529.929 671.059 521.996 643.673 556.974C616.286 591.951 625.698 590.8 606.938 615.255C588.178 639.71 592.715 642.351 569.76 665.92",
  "M719.974 450C719.974 450 765.293 459.346 789.305 476.402C813.318 493.459 825.526 487.104 865.093 495.586C904.659 504.068 908.361 510.231 943.918 523.51C979.475 536.789 963.13 535.277 1009.79 547.428",
  "M720 450C720 450 727.941 430.821 734.406 379.251C740.87 327.681 742.857 359.402 757.864 309.798C772.871 260.194 761.947 271.093 772.992 244.308C784.036 217.524 777.105 200.533 786.808 175.699",
  "M720 450C720 450 722.468 499.363 726.104 520.449C729.739 541.535 730.644 550.025 738.836 589.07C747.028 628.115 743.766 639.319 746.146 659.812C748.526 680.306 754.006 693.598 757.006 732.469",
  "M720 450C720 450 684.591 447.135 657.288 439.014C629.985 430.894 618.318 435.733 600.698 431.723C583.077 427.714 566.975 425.639 537.839 423.315C508.704 420.991 501.987 418.958 476.29 413.658",
  "M720 450C720 450 711.433 430.82 707.745 409.428C704.056 388.035 704.937 381.711 697.503 370.916C690.069 360.121 691.274 359.999 685.371 334.109C679.469 308.22 677.496 323.883 671.24 294.303",
  "M720 450C720 450 698.654 436.893 669.785 424.902C640.916 412.91 634.741 410.601 615.568 402.586C596.396 394.571 594.829 395.346 568.66 378.206C542.492 361.067 547.454 359.714 514.087 348.978",
];

// ─── Animated SVG Background ──────────────────────────────────────────────────

const PATH_COLORS = [
  "#46A5CA", "#4FAE4D", "#D6590C", "#811010", "#247AFB",
  "#A534A0", "#A8A438", "#46A29C", "#670F6D", "#D7C200",
  "#59BBEB", "#55BC54",
];

const pathVariants = {
  initial: { strokeDashoffset: 800, strokeDasharray: "50 800", opacity: 0 },
  animate: {
    strokeDashoffset: 0,
    strokeDasharray: "20 800",
    opacity: [0, 1, 1, 0],
  },
};

function AnimatedBackground() {
  return (
    <motion.svg
      viewBox="0 0 1440 900"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1 }}
      className="absolute inset-0 w-full h-full pointer-events-none"
    >
      {SVG_PATHS.map((path, idx) => (
        <motion.path
          key={`a-${idx}`}
          d={path}
          stroke={PATH_COLORS[idx % PATH_COLORS.length]}
          strokeWidth="2.3"
          strokeLinecap="round"
          variants={pathVariants}
          initial="initial"
          animate="animate"
          transition={{
            duration: 10,
            ease: "linear",
            repeat: Infinity,
            repeatType: "loop",
            delay: (idx * 1.3) % 9,
            repeatDelay: (idx * 0.7 + 2) % 8,
          }}
        />
      ))}
      {SVG_PATHS.map((path, idx) => (
        <motion.path
          key={`b-${idx}`}
          d={path}
          stroke={PATH_COLORS[(idx + 4) % PATH_COLORS.length]}
          strokeWidth="1.4"
          strokeLinecap="round"
          variants={pathVariants}
          initial="initial"
          animate="animate"
          transition={{
            duration: 12,
            ease: "linear",
            repeat: Infinity,
            repeatType: "loop",
            delay: (idx * 0.9 + 4) % 10,
            repeatDelay: (idx * 1.1 + 1) % 6,
          }}
        />
      ))}
    </motion.svg>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="relative h-full w-full flex items-center justify-center overflow-hidden">
      <AnimatedBackground />
      <div className="relative z-10 flex flex-col items-center text-center px-6">
        <div className="w-12 h-12 rounded-2xl border border-white/[0.12] bg-white/[0.05] flex items-center justify-center mb-6">
          <img src="/assets/khove-rounded.png" alt="Khove" className="w-8 h-8 object-contain select-none" draggable={false} />
        </div>
        <h1 className="text-[28px] font-semibold text-white tracking-tight mb-3 leading-tight">
          No tasks yet
        </h1>
        <p className="text-[15px] text-white/45 leading-relaxed max-w-sm mb-8">
          Tasks you create via chat will appear here, or create one manually.
        </p>
        <Link
          href="/tasks/new"
          className="inline-flex items-center gap-2 bg-white text-black rounded-full px-5 py-2.5 text-[14px] font-medium hover:bg-white/90 transition-all duration-[120ms]"
          style={{ transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)" }}
        >
          <Plus size={15} strokeWidth={2} />
          New task
        </Link>
      </div>
    </div>
  );
}

// ─── Priority Badge ───────────────────────────────────────────────────────────

const PRIORITY_STYLES: Record<string, string> = {
  URGENT: "bg-white text-black",
  HIGH:   "bg-white/[0.10] text-white/80",
  MEDIUM: "bg-white/[0.06] text-white/55",
  LOW:    "bg-white/[0.04] text-white/35",
};

const PRIORITY_LABELS: Record<string, string> = {
  URGENT: "Urgent",
  HIGH:   "High",
  MEDIUM: "Medium",
  LOW:    "Low",
};

const PRIORITY_OPTIONS = ["URGENT", "HIGH", "MEDIUM", "LOW"];

function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded ${PRIORITY_STYLES[priority] ?? "bg-white/[0.04] text-white/35"}`}>
      {PRIORITY_LABELS[priority] ?? priority}
    </span>
  );
}

function PriorityCell({
  task,
  pendingPriority,
  onPriorityChange,
}: {
  task: TaskWithStatus;
  pendingPriority: string | undefined;
  onPriorityChange: (taskId: string, priority: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const effectivePriority = pendingPriority ?? task.priority;

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative w-24 flex-shrink-0 px-2">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="flex items-center w-full rounded-md px-0.5 py-1 hover:bg-white/[0.05] transition-colors duration-[100ms]"
      >
        <PriorityBadge priority={effectivePriority} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.97 }}
              transition={{ duration: 0.1 }}
              className="absolute left-0 top-full mt-1 z-20 bg-[#111111] border border-white/[0.10] rounded-xl shadow-2xl py-1 w-36 overflow-hidden"
            >
              {PRIORITY_OPTIONS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPriorityChange(task.id, p);
                    setOpen(false);
                  }}
                  className={`flex items-center gap-2 w-full px-3 py-2 text-[12px] transition-colors hover:bg-white/[0.05] ${
                    effectivePriority === p ? "text-white" : "text-white/55"
                  }`}
                >
                  <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded ${PRIORITY_STYLES[p]}`}>
                    {PRIORITY_LABELS[p]}
                  </span>
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Source Badge ─────────────────────────────────────────────────────────────

const SOURCE_ICONS: Record<string, string> = {
  KHOVE: "/assets/khove-rounded.png",
  AI: "/assets/khove-rounded.png",
  GOOGLE_CALENDAR: "/assets/google-calendar.svg",
  GITHUB: "/assets/github.svg",
  JIRA: "/assets/jira.svg",
};

const SOURCE_LABELS: Record<string, string> = {
  KHOVE: "Khove",
  AI: "Khove",
  GITHUB: "GitHub",
  JIRA: "Jira",
  GOOGLE_CALENDAR: "Calendar",
};

function SourceBadge({ sources }: { sources: string[] }) {
  // Collect unique icons (KHOVE/AI use a text fallback, others have SVG icons)
  const icons: string[] = [];
  const seen = new Set<string>();
  for (const s of sources) {
    const icon = SOURCE_ICONS[s];
    if (icon && !seen.has(icon)) {
      seen.add(icon);
      icons.push(icon);
    }
  }

  // Overlapping icons (Instagram-style stacked avatars)
  return (
    <div className="flex items-center">
      {icons.map((icon, i) => (
        <div
          key={icon}
          className="w-5 h-5 flex items-center justify-center rounded-full bg-[#111] border border-white/[0.10]"
          style={{ marginLeft: i > 0 ? -6 : 0, zIndex: icons.length - i, overflow: i>0? 'hidden': 'visible' }}
        >
          <img src={icon} alt="" className="flex-shrink-0 w-full h-full object-cover" draggable={false} />
        </div>
      ))}
    </div>
  );
}

// ─── Breadcrumb ───────────────────────────────────────────────────────────────

function Breadcrumb({ segments }: { segments: { label: string; href?: string }[] }) {
  return (
    <nav className="flex items-center gap-1.5 text-[13px]">
      <Link href="/" className="text-white/35 hover:text-white/60 transition-colors duration-[120ms] flex items-center">
        <Home size={13} strokeWidth={1.75} />
      </Link>
      {segments.map((seg, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <ChevronRight size={11} className="text-white/20" strokeWidth={2} />
          {seg.href ? (
            <Link href={seg.href} className="text-white/40 hover:text-white/70 transition-colors duration-[120ms]">
              {seg.label}
            </Link>
          ) : (
            <span className="text-white/80">{seg.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

// ─── Sort Dropdown ────────────────────────────────────────────────────────────

type SortField = "title" | "priority" | "dueDate" | "createdAt";
type SortOrder = "asc" | "desc";

const SORT_OPTIONS: { field: SortField; label: string }[] = [
  { field: "createdAt", label: "Date created" },
  { field: "title",     label: "Title" },
  { field: "priority",  label: "Priority" },
  { field: "dueDate",   label: "Due date" },
];

function SortButton({
  sortField,
  sortOrder,
  onSort,
}: {
  sortField: SortField;
  sortOrder: SortOrder;
  onSort: (field: SortField) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = SORT_OPTIONS.find((o) => o.field === sortField);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[12px] text-white/50 hover:text-white/80 px-3 py-1.5 rounded-lg border border-white/[0.08] hover:border-white/[0.14] bg-white/[0.03] hover:bg-white/[0.06] transition-all duration-[120ms]"
      >
        <ArrowUpDown size={12} strokeWidth={2} />
        {current?.label}
        <ChevronDown size={11} strokeWidth={2} className={`transition-transform duration-[120ms] ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.97 }}
              transition={{ duration: 0.12 }}
              className="absolute right-0 top-full mt-1.5 w-44 bg-[#111111] border border-white/[0.10] rounded-xl shadow-2xl z-20 py-1 overflow-hidden"
            >
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.field}
                  type="button"
                  onClick={() => { onSort(opt.field); setOpen(false); }}
                  className={`flex items-center justify-between w-full px-3 py-2 text-[12px] transition-colors duration-[120ms] hover:bg-white/[0.05] ${
                    sortField === opt.field ? "text-white" : "text-white/55"
                  }`}
                >
                  {opt.label}
                  {sortField === opt.field && (
                    <span className="text-white/40">{sortOrder === "asc" ? "↑" : "↓"}</span>
                  )}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Smart Date Formatter ─────────────────────────────────────────────────────

function formatSmartDate(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
  const startOfDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (startOfDate.getTime() === startOfToday.getTime()) return `Today, ${time}`;
  if (startOfDate.getTime() === startOfYesterday.getTime()) return `Yesterday, ${time}`;

  const sameYear = d.getFullYear() === now.getFullYear();
  const datePart = d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(!sameYear && { year: "2-digit" }) });
  return `${datePart}, ${time}`;
}

function formatShortDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Custom Checkbox ──────────────────────────────────────────────────────────

function Checkbox({
  checked,
  onChange,
  alwaysVisible,
}: {
  checked: boolean;
  onChange: (e: React.MouseEvent) => void;
  alwaysVisible: boolean;
}) {
  return (
    <div
      onClick={onChange}
      className={[
        "w-3.5 h-3.5 rounded-sm border flex items-center justify-center cursor-pointer flex-shrink-0 transition-all duration-[100ms]",
        checked
          ? "bg-white border-white"
          : "bg-transparent border-white/[0.22]",
        !checked && !alwaysVisible
          ? "opacity-0 group-hover:opacity-100"
          : "opacity-100",
      ].join(" ")}
    >
      {checked && (
        <svg viewBox="0 0 10 8" fill="none" className="w-2.5 h-2" aria-hidden>
          <polyline
            points="1,4 3.8,7 9,1"
            stroke="black"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  );
}

// ─── Inline Status Cell ───────────────────────────────────────────────────────

function StatusCell({
  task,
  statuses,
  pendingStatusId,
  onStatusChange,
}: {
  task: TaskWithStatus;
  statuses: WorkflowStatus[];
  pendingStatusId: string | undefined;
  onStatusChange: (taskId: string, statusId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const effectiveStatusId = pendingStatusId ?? task.statusId;
  const effectiveStatus = statuses.find(s => s.id === effectiveStatusId) ?? task.status;

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative w-32 flex-shrink-0 px-2">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
        className="flex items-center gap-1.5 w-full rounded-md px-1.5 py-1 hover:bg-white/[0.05] transition-colors duration-[100ms] group/status"
      >
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: effectiveStatus?.color ?? "#71717A" }}
        />
        <span className="text-[12px] text-white/50 truncate group-hover/status:text-white/70">
          {effectiveStatus?.name ?? "—"}
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.97 }}
              transition={{ duration: 0.1 }}
              className="absolute left-0 top-full mt-1 z-20 bg-[#111111] border border-white/[0.10] rounded-xl shadow-2xl py-1 w-48 overflow-hidden"
            >
              {statuses.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStatusChange(task.id, s.id);
                    setOpen(false);
                  }}
                  className={`flex items-center gap-2 w-full px-3 py-2 text-[12px] transition-colors hover:bg-white/[0.05] ${
                    effectiveStatusId === s.id ? "text-white" : "text-white/55"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                  {s.name}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Due Date Cell ────────────────────────────────────────────────────────────

const MONTH_NAMES_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAY_HEADERS_SHORT = ["Mo","Tu","We","Th","Fr","Sa","Su"];
const TIME_SLOTS = ["08:00 AM","09:00 AM","10:00 AM","11:00 AM","12:00 PM","01:00 PM","02:00 PM","03:00 PM","04:00 PM","05:00 PM","06:00 PM","07:00 PM","08:00 PM"];

function buildMiniGrid(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  return cells;
}

function isTodayDate(d: Date): boolean {
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

function isPastDate(d: Date): boolean {
  const today = new Date(); today.setHours(0,0,0,0);
  return d < today;
}

function combineDT(date: Date, time: string | null): Date {
  if (!time) return date;
  const [hm, period] = time.split(" ");
  const [h, m] = hm.split(":").map(Number);
  const hours = period === "PM" && h !== 12 ? h + 12 : period === "AM" && h === 12 ? 0 : h;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, m);
}

function DueDateCell({
  task,
  pendingDueDate,
  onDueDateChange,
}: {
  task: TaskWithStatus;
  pendingDueDate: Date | undefined;
  onDueDateChange: (taskId: string, date: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pickerDate, setPickerDate] = useState<Date | null>(null);
  const [pickerTime, setPickerTime] = useState<string | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const ref = useRef<HTMLDivElement>(null);

  const effectiveDueDate = pendingDueDate ?? (task.dueDate ? new Date(task.dueDate) : null);
  const isOverdue = effectiveDueDate && effectiveDueDate < new Date() && task.status?.category !== "DONE";

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Pre-populate picker when opening with an existing date
  function handleOpen() {
    if (effectiveDueDate) {
      setPickerDate(effectiveDueDate);
      setYear(effectiveDueDate.getFullYear());
      setMonth(effectiveDueDate.getMonth());
      // Extract time from existing date
      const h = effectiveDueDate.getHours();
      const m = effectiveDueDate.getMinutes();
      if (h > 0 || m > 0) {
        const period = h >= 12 ? "PM" : "AM";
        const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
        setPickerTime(`${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${period}`);
      }
    }
    setOpen(true);
  }

  const cells = buildMiniGrid(year, month);

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1);
  }

  function handleConfirm() {
    if (!pickerDate) return;
    const combined = combineDT(pickerDate, pickerTime);
    onDueDateChange(task.id, combined);
    setOpen(false);
    setPickerDate(null);
    setPickerTime(null);
  }

  return (
    <div ref={ref} className="relative w-36 flex-shrink-0 px-2">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); if (open) setOpen(false); else handleOpen(); }}
        className={`flex items-center gap-1.5 text-[12px] transition-colors duration-[100ms] w-full rounded-md px-1 py-1 hover:bg-white/[0.05] ${
          effectiveDueDate
            ? isOverdue ? "text-white/70" : "text-white/45"
            : "text-white/25 hover:text-white/50"
        }`}
      >
        <Calendar size={11} strokeWidth={1.75} />
        {effectiveDueDate ? formatSmartDate(effectiveDueDate) : "Add date"}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.97 }}
              transition={{ duration: 0.1 }}
              onClick={(e) => e.stopPropagation()}
              className="absolute left-0 top-full mt-1.5 z-20 bg-[#111111] border border-white/[0.10] rounded-xl shadow-2xl p-3 w-[420px] flex gap-3"
            >
              {/* Calendar */}
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <button type="button" onClick={prevMonth} className="w-6 h-6 flex items-center justify-center rounded text-white/40 hover:bg-white/[0.06] hover:text-white/70">
                    <ChevronLeft size={12} />
                  </button>
                  <span className="text-[12px] font-medium text-white/70">
                    {MONTH_NAMES_SHORT[month]} {year}
                  </span>
                  <button type="button" onClick={nextMonth} className="w-6 h-6 flex items-center justify-center rounded text-white/40 hover:bg-white/[0.06] hover:text-white/70">
                    <ChevronRight size={12} />
                  </button>
                </div>
                <div className="grid grid-cols-7 mb-1">
                  {DAY_HEADERS_SHORT.map(d => (
                    <div key={d} className="text-center text-[9px] text-white/25 py-0.5">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-y-0.5">
                  {cells.map((day, i) => {
                    if (!day) return <div key={i} />;
                    const past = isPastDate(day);
                    const todayCell = isTodayDate(day);
                    const selected = pickerDate &&
                      pickerDate.getFullYear() === day.getFullYear() &&
                      pickerDate.getMonth() === day.getMonth() &&
                      pickerDate.getDate() === day.getDate();
                    return (
                      <button
                        key={i}
                        type="button"
                        disabled={past}
                        onClick={() => setPickerDate(day)}
                        className={[
                          "w-full aspect-square flex items-center justify-center rounded text-[11px] transition-colors",
                          past ? "text-white/15 cursor-not-allowed" :
                          selected ? "bg-white text-black font-semibold" :
                          todayCell ? "border border-white/[0.25] text-white/70 hover:bg-white/[0.06]" :
                          "text-white/55 hover:bg-white/[0.06]",
                        ].join(" ")}
                      >
                        {day.getDate()}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Time slots */}
              <div className="w-[130px] flex-shrink-0 flex flex-col">
                <p className="text-[10px] text-white/30 mb-2 font-medium uppercase tracking-wider">Time</p>
                <div className="flex-1 overflow-y-auto max-h-[200px] grid grid-cols-1 gap-1">
                  {TIME_SLOTS.map(slot => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setPickerTime(slot)}
                      className={[
                        "text-[11px] rounded-md px-2 py-1 text-left transition-colors",
                        pickerTime === slot ? "bg-white text-black font-semibold" : "text-white/50 hover:bg-white/[0.06] hover:text-white/80",
                      ].join(" ")}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={!pickerDate}
                  onClick={handleConfirm}
                  className="mt-3 w-full py-1.5 rounded-lg bg-white text-black text-[11px] font-semibold hover:bg-white/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  Confirm
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Task Table ───────────────────────────────────────────────────────────────

const rowVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.03, type: "spring" as const, stiffness: 400, damping: 30 },
  }),
};

function TaskTable({
  tasks,
  statuses,
  selectedIds,
  onToggle,
  onToggleAll,
  pendingStatusIds,
  onStatusChange,
  pendingDueDates,
  onDueDateChange,
  pendingPriorityIds,
  onPriorityChange,
}: {
  tasks: TaskWithStatus[];
  statuses: WorkflowStatus[];
  selectedIds: Set<string>;
  onToggle: (id: string, e: React.MouseEvent) => void;
  onToggleAll: (e: React.MouseEvent) => void;
  pendingStatusIds: Record<string, string>;
  onStatusChange: (taskId: string, statusId: string) => void;
  pendingDueDates: Record<string, Date>;
  onDueDateChange: (taskId: string, date: Date) => void;
  pendingPriorityIds: Record<string, string>;
  onPriorityChange: (taskId: string, priority: string) => void;
}) {
  const router = useRouter();
  const allSelected = tasks.length > 0 && tasks.every((t) => selectedIds.has(t.id));
  const someSelected = tasks.some((t) => selectedIds.has(t.id));

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[820px]">
        {/* Header */}
        <div className="flex items-center px-4 py-2.5 border-b border-white/[0.08] bg-white/[0.025]">
          <div className="w-8 flex-shrink-0 flex items-center">
            <Checkbox
              checked={allSelected}
              onChange={onToggleAll}
              alwaysVisible={someSelected}
            />
          </div>
          <div className="flex-1 min-w-0 text-[11px] font-semibold tracking-widest uppercase text-white/30 px-2">Title</div>
          <div className="w-32 flex-shrink-0 text-[11px] font-semibold tracking-widest uppercase text-white/30 px-2">Status</div>
          <div className="w-24 flex-shrink-0 text-[11px] font-semibold tracking-widest uppercase text-white/30 px-2">Priority</div>
          <div className="w-20 flex-shrink-0 text-[11px] font-semibold tracking-widest uppercase text-white/30 px-2">Source</div>
          <div className="w-36 flex-shrink-0 text-[11px] font-semibold tracking-widest uppercase text-white/30 px-2">Due date</div>
          <div className="w-36 flex-shrink-0 text-[11px] font-semibold tracking-widest uppercase text-white/30 px-2">Created</div>
        </div>

        {/* Rows */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.03 } } }}
        >
          {tasks.map((task, i) => {
            const isSelected = selectedIds.has(task.id);
            const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status?.category !== "DONE";

            return (
              <motion.div
                key={task.id}
                custom={i}
                variants={rowVariants}
                onClick={(e) => { if (selectedIds.size > 0) onToggle(task.id, e); }}
                className={[
                  "flex items-center px-4 py-3 border-b border-white/[0.05] transition-colors duration-[100ms] group",
                  isSelected ? "bg-white/[0.05]" : "hover:bg-white/[0.04]",
                  selectedIds.size > 0 ? "cursor-pointer" : "cursor-default",
                ].join(" ")}
                style={{ transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)" }}
              >
                {/* Checkbox */}
                <div className="w-8 flex-shrink-0 flex items-center">
                  <Checkbox
                    checked={isSelected}
                    onChange={(e) => onToggle(task.id, e)}
                    alwaysVisible={isSelected}
                  />
                </div>

                {/* Title — click navigates, hover underlines */}
                <div className="flex-1 min-w-0 px-2">
                  <span
                    onClick={(e) => { e.stopPropagation(); router.push(`/tasks/${task.id}`); }}
                    className={[
                      "text-[13px] font-medium text-white/90 group-hover:text-white/95 truncate block leading-snug transition-colors duration-[100ms] cursor-pointer hover:underline underline-offset-2",
                      task.status?.category === "CANCELLED" ? "line-through text-white/35 group-hover:text-white/40" : "",
                    ].join(" ")}
                  >
                    {task.title}
                  </span>
                </div>

                {/* Status — inline editable */}
                <StatusCell
                  task={task}
                  statuses={statuses}
                  pendingStatusId={pendingStatusIds[task.id]}
                  onStatusChange={onStatusChange}
                />

                {/* Priority */}
                <PriorityCell
                  task={task}
                  pendingPriority={pendingPriorityIds[task.id]}
                  onPriorityChange={onPriorityChange}
                />

                {/* Source */}
                <div className="w-20 flex-shrink-0 px-2">
                  <SourceBadge sources={task.source} />
                </div>

                {/* Due date — editable if empty */}
                <DueDateCell
                  task={task}
                  pendingDueDate={pendingDueDates[task.id]}
                  onDueDateChange={onDueDateChange}
                />

                {/* Created */}
                <div className="w-36 flex-shrink-0 px-2">
                  <span className="text-[12px] text-white/25">
                    {formatSmartDate(task.createdAt)}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </div>
  );
}

// ─── Kanban Board ─────────────────────────────────────────────────────────────

function KanbanBoard({
  tasks,
  statuses,
  pendingStatusIds,
  onStatusChange,
}: {
  tasks: TaskWithStatus[];
  statuses: WorkflowStatus[];
  pendingStatusIds: Record<string, string>;
  onStatusChange: (taskId: string, statusId: string) => void;
}) {
  const router = useRouter();
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  // Group tasks by effective statusId (pending takes priority)
  const tasksByStatus = useMemo(() => {
    const map: Record<string, TaskWithStatus[]> = {};
    for (const s of statuses) map[s.id] = [];

    for (const t of tasks) {
      const sid = pendingStatusIds[t.id] ?? t.statusId;
      // Put in matching column, or first column if unmatched
      const col = sid && map[sid] !== undefined ? sid : statuses[0]?.id;
      if (col) map[col].push(t);
    }
    return map;
  }, [tasks, statuses, pendingStatusIds]);

  function handleDragStart(e: React.DragEvent, taskId: string) {
    e.dataTransfer.setData("taskId", taskId);
  }

  function handleDrop(e: React.DragEvent, statusId: string) {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("taskId");
    if (taskId) onStatusChange(taskId, statusId);
    setDragOverCol(null);
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 px-6 pt-4 h-full">
      {statuses.map(status => {
        const colTasks = tasksByStatus[status.id] ?? [];
        return (
          <div
            key={status.id}
            className={`w-[280px] flex-shrink-0 flex flex-col rounded-xl border transition-colors duration-[120ms] ${
              dragOverCol === status.id
                ? "border-white/[0.20] bg-white/[0.06]"
                : "border-white/[0.07] bg-white/[0.03]"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOverCol(status.id); }}
            onDragLeave={() => setDragOverCol(null)}
            onDrop={(e) => handleDrop(e, status.id)}
          >
            {/* Column header */}
            <div className="flex items-center gap-2 px-3 pt-3 pb-2 flex-shrink-0">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: status.color }} />
              <span className="text-[12px] font-medium text-white/70 flex-1 truncate">{status.name}</span>
              <span className="text-[10px] text-white/30 bg-white/[0.06] rounded px-1.5 py-0.5 leading-none">
                {colTasks.length}
              </span>
            </div>

            {/* Cards */}
            <div className="flex-1 overflow-y-auto px-2 pb-2 flex flex-col gap-2">
              {colTasks.map(task => (
                <div
                  key={task.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, task.id)}
                  onClick={() => router.push(`/tasks/${task.id}`)}
                  className="bg-white/[0.05] border border-white/[0.07] rounded-lg p-3 cursor-grab active:cursor-grabbing hover:bg-white/[0.08] hover:border-white/[0.12] transition-all duration-[100ms] select-none"
                >
                  <p className={[
                    "text-[13px] font-medium leading-snug mb-2 line-clamp-2",
                    task.status?.category === "CANCELLED"
                      ? "line-through text-white/35"
                      : "text-white/85",
                  ].join(" ")}>
                    {task.title}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <PriorityBadge priority={task.priority} />
                    {task.dueDate && (
                      <span className="text-[10px] text-white/30">
                        {formatShortDate(task.dueDate)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function TasksClient({ tasks, statuses }: TasksClientProps) {
  const [viewMode, setViewMode] = useState<"table" | "kanban">("table");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingStatusIds, setPendingStatusIds] = useState<Record<string, string>>({});
  const [pendingDueDates, setPendingDueDates] = useState<Record<string, Date>>({});
  const [pendingPriorityIds, setPendingPriorityIds] = useState<Record<string, string>>({});

  const handleDueDateChange = async (taskId: string, date: Date) => {
    setPendingDueDates(p => ({ ...p, [taskId]: date }));
    try {
      const res = await fetch(`/api/tasks/${taskId}/due-date`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dueDate: date.toISOString() }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setPendingDueDates(p => { const n = { ...p }; delete n[taskId]; return n; });
    }
  };

  const handleStatusChange = async (taskId: string, statusId: string) => {
    const prev = pendingStatusIds[taskId] ?? tasks.find(t => t.id === taskId)?.statusId;
    // Optimistic update
    setPendingStatusIds(p => ({ ...p, [taskId]: statusId }));
    try {
      const res = await fetch(`/api/tasks/${taskId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusId }),
      });
      if (!res.ok) throw new Error("failed");
    } catch {
      // Revert on error
      setPendingStatusIds(p => {
        const next = { ...p };
        if (prev) next[taskId] = prev;
        else delete next[taskId];
        return next;
      });
    }
  };

  const handlePriorityChange = async (taskId: string, priority: string) => {
    const prev = pendingPriorityIds[taskId] ?? tasks.find(t => t.id === taskId)?.priority;
    setPendingPriorityIds(p => ({ ...p, [taskId]: priority }));
    try {
      const res = await fetch(`/api/tasks/${taskId}/priority`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setPendingPriorityIds(p => {
        const next = { ...p };
        if (prev) next[taskId] = prev;
        else delete next[taskId];
        return next;
      });
    }
  };

  // ── GCal confirmation dialog state ──────────────────────────────────────
  const [confirmDialog, setConfirmDialog] = useState<{
    taskId: string;
    statusId: string;
    type: "cancel" | "done";
  } | null>(null);

  /** Gated status change — intercepts CANCELLED/DONE for GCal-synced tasks. */
  const requestStatusChange = (taskId: string, statusId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    const targetStatus = statuses.find((s) => s.id === statusId);
    const isGcalSynced = task?.source.includes("GOOGLE_CALENDAR");

    if (isGcalSynced && targetStatus?.category === "CANCELLED") {
      setConfirmDialog({ taskId, statusId, type: "cancel" });
      return;
    }

    if (isGcalSynced && targetStatus?.category === "DONE") {
      const meta = (task?.metadata as Record<string, unknown> | null)?.googleCalendar as Record<string, unknown> | undefined;
      const endTime = meta?.endDateTime ? new Date(meta.endDateTime as string) : null;
      if (endTime && endTime > new Date()) {
        setConfirmDialog({ taskId, statusId, type: "done" });
        return;
      }
    }

    handleStatusChange(taskId, statusId);
  };

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (pageIds: string[]) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const allSelected = pageIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
    setPage(1);
  };

  const sorted = useMemo(() => {
    return [...tasks].sort((a, b) => {
      let av: string | number, bv: string | number;
      if (sortField === "title") {
        av = a.title.toLowerCase();
        bv = b.title.toLowerCase();
      } else if (sortField === "priority") {
        av = PRIORITY_ORDER[a.priority] ?? 99;
        bv = PRIORITY_ORDER[b.priority] ?? 99;
      } else if (sortField === "dueDate") {
        av = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        bv = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      } else {
        av = new Date(a.createdAt).getTime();
        bv = new Date(b.createdAt).getTime();
      }
      if (av < bv) return sortOrder === "asc" ? -1 : 1;
      if (av > bv) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
  }, [tasks, sortField, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / ITEMS_PER_PAGE));
  const paginated = sorted.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  if (tasks.length === 0) return <EmptyState />;

  return (
    <div className="h-full flex flex-col bg-black">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.07] flex-shrink-0">
        <div className="flex items-center gap-4">
          <Breadcrumb segments={[{ label: "Tasks" }]} />
          <span className="text-[11px] text-white/25 border border-white/[0.08] rounded px-1.5 py-0.5 leading-none">
            {tasks.length}
          </span>
          {selectedIds.size > 0 && (
            <AnimatePresence>
              <motion.div
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }}
                transition={{ duration: 0.14 }}
                className="flex items-center gap-2"
              >
                <span className="text-[12px] text-white/50">
                  {selectedIds.size} selected
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="text-[11px] text-white/35 hover:text-white/60 transition-colors duration-[120ms]"
                >
                  Clear
                </button>
                <span className="w-px h-3 bg-white/[0.12]" />
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="text-[12px] text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 hover:bg-red-500/10 rounded-lg px-2.5 py-1 transition-all duration-[120ms]"
                >
                  Delete
                </button>
              </motion.div>
            </AnimatePresence>
          )}
        </div>

        <div className="flex items-center gap-2">

          {viewMode === "table" && (
            <SortButton sortField={sortField} sortOrder={sortOrder} onSort={handleSort} />
          )}

          {/* View toggle */}
          <div className="flex items-center border border-white/[0.08] rounded-lg overflow-hidden bg-white/[0.02]">
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] transition-colors duration-[100ms] ${
                viewMode === "table" ? "bg-white/[0.08] text-white" : "text-white/40 hover:text-white/60"
              }`}
            >
              <LayoutList size={12} strokeWidth={2} />
              Table
            </button>
            <button
              type="button"
              onClick={() => setViewMode("kanban")}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] transition-colors duration-[100ms] ${
                viewMode === "kanban" ? "bg-white/[0.08] text-white" : "text-white/40 hover:text-white/60"
              }`}
            >
              <Columns size={12} strokeWidth={2} />
              Kanban
            </button>
          </div>
          
          <Link
            href="/tasks/new"
            className="flex items-center gap-1.5 text-[12px] font-medium bg-white text-black rounded-lg px-3 py-1.5 hover:bg-white/90 transition-all duration-[120ms]"
            style={{ transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)" }}
          >
            <Plus size={13} strokeWidth={2.5} />
            New task
          </Link>
        </div>
      </div>

      {/* Content */}
      {viewMode === "table" ? (
        <>
          <div className="flex-1 overflow-y-auto">
            <TaskTable
              tasks={paginated}
              statuses={statuses}
              selectedIds={selectedIds}
              onToggle={toggleSelect}
              onToggleAll={toggleSelectAll(paginated.map((t) => t.id))}
              pendingStatusIds={pendingStatusIds}
              onStatusChange={requestStatusChange}
              pendingDueDates={pendingDueDates}
              onDueDateChange={handleDueDateChange}
              pendingPriorityIds={pendingPriorityIds}
              onPriorityChange={handlePriorityChange}
            />
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-t border-white/[0.07]">
              <span className="text-[12px] text-white/30">
                Page {page} of {totalPages} · {tasks.length} task{tasks.length !== 1 ? "s" : ""}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex items-center gap-1 text-[12px] text-white/40 hover:text-white/70 disabled:opacity-20 disabled:cursor-not-allowed px-2.5 py-1.5 rounded-lg border border-white/[0.08] hover:border-white/[0.14] hover:bg-white/[0.04] transition-all duration-[120ms]"
                >
                  <ChevronLeft size={12} strokeWidth={2} />
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="flex items-center gap-1 text-[12px] text-white/40 hover:text-white/70 disabled:opacity-20 disabled:cursor-not-allowed px-2.5 py-1.5 rounded-lg border border-white/[0.08] hover:border-white/[0.14] hover:bg-white/[0.04] transition-all duration-[120ms]"
                >
                  Next
                  <ChevronRight size={12} strokeWidth={2} />
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex-1 overflow-hidden">
          <KanbanBoard
            tasks={tasks}
            statuses={statuses}
            pendingStatusIds={pendingStatusIds}
            onStatusChange={requestStatusChange}
          />
        </div>
      )}

      {/* GCal confirmation dialogs */}
      {confirmDialog?.type === "cancel" && (
        <ConfirmDialog
          open
          onClose={() => setConfirmDialog(null)}
          onConfirm={() => handleStatusChange(confirmDialog.taskId, confirmDialog.statusId)}
          title="Cancel linked meeting?"
          description="This task has a Google Meet meeting linked. Cancelling the task will also cancel the meeting."
          confirmLabel="Cancel task & meeting"
          cancelLabel="Keep task"
          variant="danger"
        />
      )}
      {confirmDialog?.type === "done" && (
        <ConfirmDialog
          open
          onClose={() => setConfirmDialog(null)}
          onConfirm={() => handleStatusChange(confirmDialog.taskId, confirmDialog.statusId)}
          title="Meeting still active"
          description="The linked Google Meet meeting hasn't ended yet. Would you like to keep or cancel the meeting?"
          confirmLabel="Mark done & cancel meeting"
          secondaryLabel="Mark done & keep meeting"
          onSecondary={() => handleStatusChange(confirmDialog.taskId, confirmDialog.statusId)}
          cancelLabel="Go back"
          variant="warning"
        />
      )}
    </div>
  );
}
