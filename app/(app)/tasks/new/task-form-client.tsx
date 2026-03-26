"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Home,
  ChevronRight,
  ArrowLeft,
  Calendar,
  GitBranch,
  Layers,
  ChevronLeft,
  ChevronDown,
  Clock,
} from "lucide-react";
import type { WorkflowStatus } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TaskFormClientProps {
  statuses: WorkflowStatus[];
  connectedProviders: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PRIORITY_OPTIONS = [
  { value: "URGENT", label: "Urgent" },
  { value: "HIGH",   label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW",    label: "Low" },
] as const;

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAY_HEADERS = ["Mo","Tu","We","Th","Fr","Sa","Su"];

const TIME_SLOTS = [
  "08:00 AM","09:00 AM","10:00 AM","11:00 AM",
  "12:00 PM","01:00 PM","02:00 PM","03:00 PM",
  "04:00 PM","05:00 PM","06:00 PM","07:00 PM","08:00 PM",
];

function buildGrid(year: number, month: number): (Date | null)[] {
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  return cells;
}

function isToday(date: Date): boolean {
  const now = new Date();
  return date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
}

function isPast(date: Date): boolean {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return date < today;
}

function formatDisplayDate(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function combineDatetime(date: Date, time: string | null): Date {
  if (!time) return date;
  const [hm, period] = time.split(" ");
  const [h, m] = hm.split(":").map(Number);
  const hours = period === "PM" && h !== 12 ? h + 12 : period === "AM" && h === 12 ? 0 : h;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, m);
}

// ---------------------------------------------------------------------------
// Description Input (mirror overlay — hashtag/mention highlighting)
// ---------------------------------------------------------------------------

function DescriptionInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  function renderHighlighted(text: string) {
    const parts = text.split(/([@#]\w+)/g);
    return parts.map((tok, i) =>
      /^[@#]\w+/.test(tok)
        ? <span key={i} className="text-blue-400">{tok}</span>
        : <span key={i} className="text-white/70">{tok}</span>
    );
  }

  return (
    <div className="relative min-h-[100px]">
      {/* Mirror layer — shows highlighted tokens, pointer-events-none */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 p-3 text-[14px] leading-relaxed whitespace-pre-wrap break-words overflow-hidden rounded-lg font-sans"
      >
        {renderHighlighted(value)}
        {/* trailing space so mirror height tracks textarea correctly */}
        {"\u200b"}
      </div>
      {/* Actual textarea — transparent text, visible caret */}
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Add a description… Use #hashtags and @mentions"
        rows={4}
        className="relative w-full min-h-[100px] bg-white/[0.04] border border-white/[0.08] rounded-lg p-3 text-[14px] leading-relaxed text-transparent caret-white placeholder:text-white/25 outline-none focus:border-white/[0.20] resize-y font-sans"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Date Picker Popover
// ---------------------------------------------------------------------------

function DatePicker({
  value,
  onChange,
}: {
  value: Date | null;
  onChange: (d: Date | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const cells = buildGrid(year, month);

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  return (
    <div ref={ref} className="relative flex-1">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 border border-white/[0.10] rounded-lg px-3 py-2 text-[13px] text-white/60 hover:border-white/[0.20] hover:text-white/80 transition-colors duration-[120ms] w-full"
      >
        <Calendar size={13} strokeWidth={1.75} className="text-white/30 flex-shrink-0" />
        {value ? formatDisplayDate(value) : <span className="text-white/25">Pick a date</span>}
        {value && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange(null); }}
            className="ml-auto text-white/30 hover:text-white/60"
          >
            ×
          </button>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 z-50 bg-[#111111] border border-white/[0.10] rounded-xl p-4 shadow-2xl w-72">
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={prevMonth} className="w-7 h-7 flex items-center justify-center rounded-lg text-white/50 hover:bg-white/[0.06] hover:text-white/80 transition-colors">
              <ChevronLeft size={14} />
            </button>
            <span className="text-[13px] font-medium text-white/80">
              {MONTH_NAMES[month]} {year}
            </span>
            <button type="button" onClick={nextMonth} className="w-7 h-7 flex items-center justify-center rounded-lg text-white/50 hover:bg-white/[0.06] hover:text-white/80 transition-colors">
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAY_HEADERS.map(d => (
              <div key={d} className="text-center text-[10px] text-white/25 py-1">{d}</div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {cells.map((day, i) => {
              if (!day) return <div key={i} />;
              const past = isPast(day);
              const todayCell = isToday(day);
              const selected = value &&
                value.getFullYear() === day.getFullYear() &&
                value.getMonth() === day.getMonth() &&
                value.getDate() === day.getDate();
              return (
                <button
                  key={i}
                  type="button"
                  disabled={past}
                  onClick={() => { onChange(day); setOpen(false); }}
                  className={[
                    "w-full aspect-square flex items-center justify-center rounded-lg text-[12px] transition-colors duration-[100ms]",
                    past ? "text-white/15 cursor-not-allowed" :
                    selected ? "bg-white text-black font-semibold" :
                    todayCell ? "border border-white/[0.30] text-white/80 hover:bg-white/[0.06]" :
                    "text-white/60 hover:bg-white/[0.06] hover:text-white/90",
                  ].join(" ")}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Time Picker
// ---------------------------------------------------------------------------

function TimePicker({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (t: string | null) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative w-36">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(v => !v)}
        className={[
          "flex items-center gap-2 border border-white/[0.10] rounded-lg px-3 py-2 text-[13px] w-full transition-colors duration-[120ms]",
          disabled
            ? "opacity-40 cursor-not-allowed text-white/30"
            : "text-white/60 hover:border-white/[0.20] hover:text-white/80 cursor-pointer",
        ].join(" ")}
      >
        <Clock size={13} strokeWidth={1.75} className="text-white/30 flex-shrink-0" />
        {value ? (
          <span className="text-white/70 truncate">{value}</span>
        ) : (
          <span className="text-white/25">Time</span>
        )}
        <ChevronDown size={11} className="ml-auto text-white/25 flex-shrink-0" />
      </button>

      {open && !disabled && (
        <div className="absolute left-0 top-full mt-2 z-50 bg-[#111111] border border-white/[0.10] rounded-xl shadow-2xl p-2 w-36 max-h-60 overflow-y-auto">
          <button
            type="button"
            onClick={() => { onChange(null); setOpen(false); }}
            className="w-full text-left text-[12px] text-white/30 px-2 py-1.5 rounded-md hover:bg-white/[0.05] transition-colors mb-1"
          >
            No time
          </button>
          {TIME_SLOTS.map(slot => (
            <button
              key={slot}
              type="button"
              onClick={() => { onChange(slot); setOpen(false); }}
              className={[
                "w-full text-left text-[12px] px-2 py-1.5 rounded-md transition-colors",
                value === slot ? "bg-white text-black font-semibold" : "text-white/60 hover:bg-white/[0.06]",
              ].join(" ")}
            >
              {slot}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status Dropdown
// ---------------------------------------------------------------------------

function StatusDropdown({
  statuses,
  value,
  onChange,
}: {
  statuses: WorkflowStatus[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = statuses.find(s => s.id === value);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 w-full border border-white/[0.10] rounded-lg px-3 py-2 text-[13px] text-white/60 hover:border-white/[0.20] hover:text-white/80 transition-colors duration-[120ms]"
      >
        {selected ? (
          <>
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: selected.color }} />
            <span className="text-white/70">{selected.name}</span>
          </>
        ) : (
          <span className="text-white/25">No status</span>
        )}
        <ChevronDown size={12} className="ml-auto text-white/30" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-50 bg-[#111111] border border-white/[0.10] rounded-xl shadow-2xl py-1 w-full min-w-[180px]">
          <button
            type="button"
            onClick={() => { onChange(null); setOpen(false); }}
            className="flex items-center gap-2 w-full px-3 py-2 text-[12px] text-white/35 hover:bg-white/[0.05] transition-colors"
          >
            No status
          </button>
          {statuses.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => { onChange(s.id); setOpen(false); }}
              className={`flex items-center gap-2 w-full px-3 py-2 text-[12px] transition-colors hover:bg-white/[0.05] ${value === s.id ? "text-white" : "text-white/60"}`}
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sync Card
// ---------------------------------------------------------------------------

function SyncCard({
  label,
  Icon,
  connected,
  checked,
  onToggle,
}: {
  label: string;
  Icon: React.ElementType;
  connected: boolean;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`border border-white/[0.08] rounded-xl p-4 flex items-center gap-3 ${!connected ? "opacity-40" : ""}`}>
      <div className="w-8 h-8 rounded-lg bg-white/[0.06] border border-white/[0.08] flex items-center justify-center flex-shrink-0">
        <Icon size={15} className="text-white/60" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-white/80 font-medium">{label}</p>
        {!connected && (
          <Link href="/settings/integrations" className="text-[11px] text-white/35 hover:text-white/60 transition-colors">
            Not connected
          </Link>
        )}
      </div>
      {connected && (
        <button
          type="button"
          onClick={onToggle}
          className={[
            "w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-all duration-[100ms]",
            checked ? "bg-white border-white" : "border-white/[0.20] bg-transparent",
          ].join(" ")}
        >
          {checked && (
            <svg viewBox="0 0 10 8" fill="none" className="w-2.5 h-2">
              <polyline points="1,4 3.8,7 9,1" stroke="black" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function TaskFormClient({ statuses, connectedProviders }: TaskFormClientProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"URGENT" | "HIGH" | "MEDIUM" | "LOW">("MEDIUM");
  const [statusId, setStatusId] = useState<string | null>(statuses[0]?.id ?? null);
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [dueTime, setDueTime] = useState<string | null>(null);
  const [syncTo, setSyncTo] = useState<Record<string, boolean>>({ GOOGLE_CALENDAR: false, GITHUB: false, JIRA: false });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleSync = (key: string) => {
    setSyncTo(prev => ({ ...prev, [key]: !prev[key] }));
  };

  function handleDateChange(d: Date | null) {
    setDueDate(d);
    if (!d) setDueTime(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("Title is required."); return; }
    setError(null);
    setSubmitting(true);
    try {
      const combinedDate = dueDate ? combineDatetime(dueDate, dueTime) : null;
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          priority,
          statusId: statusId ?? undefined,
          dueDate: combinedDate ? combinedDate.toISOString() : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong.");
        setSubmitting(false);
        return;
      }
      router.push("/tasks");
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="h-full flex flex-col bg-black overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.07] flex-shrink-0">
        <nav className="flex items-center gap-1.5 text-[13px]">
          <Link href="/" className="text-white/35 hover:text-white/60 transition-colors duration-[120ms] flex items-center">
            <Home size={13} strokeWidth={1.75} />
          </Link>
          <ChevronRight size={11} className="text-white/20" strokeWidth={2} />
          <Link href="/tasks" className="text-white/40 hover:text-white/70 transition-colors duration-[120ms]">
            Tasks
          </Link>
          <ChevronRight size={11} className="text-white/20" strokeWidth={2} />
          <span className="text-white/80">New task</span>
        </nav>
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-[12px] text-white/40 hover:text-white/70 transition-colors duration-[120ms] cursor-pointer"
        >
          <ArrowLeft size={13} strokeWidth={1.75} />
          Back
        </button>
      </div>

      {/* Body */}
      <form onSubmit={handleSubmit} className="flex-1 max-w-4xl mx-auto w-full px-6 py-8">
        <div className="flex gap-10 items-start">

          {/* ── Left: main form ─────────────────────────────────────── */}
          <div className="flex-1 min-w-0 flex flex-col gap-6">
            <div>
              <h1 className="text-[22px] font-semibold text-white tracking-tight mb-1">New task</h1>
              <p className="text-[13px] text-white/35">Fill in the details below to create a new task.</p>
            </div>

            {/* Title */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] text-white/40 font-medium">Title</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="What needs to be done?"
                autoFocus
                className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-[14px] text-white placeholder:text-white/25 outline-none focus:border-white/[0.20] focus:bg-white/[0.06] transition-all duration-[120ms]"
              />
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] text-white/40 font-medium">Description</label>
              <DescriptionInput value={description} onChange={setDescription} />
            </div>

            {/* Priority */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] text-white/40 font-medium">Priority</label>
              <div className="flex gap-2 flex-wrap">
                {PRIORITY_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPriority(opt.value)}
                    className={[
                      "px-3 py-1.5 rounded-full text-[12px] font-medium transition-all duration-[100ms]",
                      priority === opt.value
                        ? "bg-white text-black"
                        : "border border-white/[0.12] text-white/50 hover:border-white/[0.25] hover:text-white/75",
                    ].join(" ")}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Status */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] text-white/40 font-medium">Status</label>
              <StatusDropdown statuses={statuses} value={statusId} onChange={setStatusId} />
            </div>

            {/* Due date + Time on same row */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] text-white/40 font-medium">Due date</label>
              <div className="flex gap-2 items-stretch">
                <DatePicker value={dueDate} onChange={handleDateChange} />
                <TimePicker value={dueTime} onChange={setDueTime} disabled={!dueDate} />
              </div>
            </div>

            {/* Error */}
            {error && (
              <p className="text-[13px] text-white/70 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="bg-white text-black rounded-full px-5 py-2.5 text-[13px] font-medium hover:bg-white/90 transition-all duration-[120ms] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "Creating…" : "Create task"}
              </button>
              <button
                type="button"
                onClick={() => router.back()}
                className="border border-white/[0.12] text-white/50 rounded-full px-5 py-2.5 text-[13px] hover:bg-white/[0.05] hover:text-white/70 transition-all duration-[120ms]"
              >
                Cancel
              </button>
            </div>
          </div>

          {/* ── Right: sync panel ────────────────────────────────────── */}
          <div className="w-64 flex-shrink-0 flex flex-col gap-3 pt-[76px]">
            <p className="text-[12px] text-white/40 font-medium mb-1">Sync to</p>
            <SyncCard
              label="Google Calendar"
              Icon={Calendar}
              connected={connectedProviders.includes("GOOGLE_CALENDAR")}
              checked={syncTo.GOOGLE_CALENDAR}
              onToggle={() => toggleSync("GOOGLE_CALENDAR")}
            />
            <SyncCard
              label="GitHub"
              Icon={GitBranch}
              connected={connectedProviders.includes("GITHUB")}
              checked={syncTo.GITHUB}
              onToggle={() => toggleSync("GITHUB")}
            />
            <SyncCard
              label="Jira"
              Icon={Layers}
              connected={connectedProviders.includes("JIRA")}
              checked={syncTo.JIRA}
              onToggle={() => toggleSync("JIRA")}
            />
          </div>
        </div>
      </form>
    </div>
  );
}
