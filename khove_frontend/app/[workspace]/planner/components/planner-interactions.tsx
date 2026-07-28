"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { CalendarClock, Link2, ListTodo, MapPin, Trash2, Users, Video, X, ExternalLink } from "lucide-react";
import { useBackendFetch } from "@/lib/trpc/api";
import type { PlannerAttendee } from "@/lib/types";

// ---------------------------------------------------------------------------
// Shared detail shape (both month and week/day produce this)
// ---------------------------------------------------------------------------

export interface PlannerEventDetail {
  id: string; // task id (empty for entries)
  title: string;
  start: string; // ISO
  end?: string; // ISO
  isTask: boolean; // entries are read-only
  color: string;
  meetLink?: string | null;
  location?: string | null;
  attendees?: PlannerAttendee[];
  threadId?: string | null;
  threadTitle?: string | null;
}

export interface CreateEventInput {
  summary: string;
  start: Date;
  end: Date;
  agenda?: string;
  location?: string;
  guests?: string[];
  generateMeetLink?: boolean;
  addAsTask?: boolean;
}

interface InteractionsCtx {
  openItem: (d: PlannerEventDetail) => void;
  openCreate: (at: Date) => void;
  rescheduleTask: (taskId: string, newStart: Date) => Promise<void>;
  canWrite: boolean;
}

const Ctx = createContext<InteractionsCtx | null>(null);

export function usePlannerInteractions(): InteractionsCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // No-op fallback keeps views usable outside the provider.
    return {
      openItem: () => {},
      openCreate: () => {},
      rescheduleTask: async () => {},
      canWrite: false,
    };
  }
  return ctx;
}

const RSVP_COLOR: Record<string, string> = {
  accepted: "bg-emerald-400",
  declined: "bg-red-400",
  tentative: "bg-amber-400",
  needsAction: "bg-white/30",
};

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function PlannerInteractionsProvider({
  workspaceId,
  slug,
  canWrite,
  isGoogleConnected,
  children,
}: {
  workspaceId: string;
  slug: string;
  canWrite: boolean;
  isGoogleConnected: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const backendFetch = useBackendFetch();
  const [detail, setDetail] = useState<PlannerEventDetail | null>(null);
  const [createAt, setCreateAt] = useState<Date | null>(null);

  const rescheduleTask = useCallback(
    async (taskId: string, newStart: Date) => {
      await backendFetch(
        `/api/tasks/${taskId}/due-date`,
        { method: "PATCH", body: JSON.stringify({ dueDate: newStart.toISOString() }) },
        workspaceId,
      );
      router.refresh();
    },
    [backendFetch, workspaceId, router],
  );

  const deleteTask = useCallback(
    async (taskId: string) => {
      await backendFetch(`/api/tasks/${taskId}`, { method: "DELETE" }, workspaceId);
      router.refresh();
    },
    [backendFetch, workspaceId, router],
  );

  const createEvent = useCallback(
    async (input: CreateEventInput) => {
      const res = await backendFetch(
        `/api/calendar/events`,
        {
          method: "POST",
          body: JSON.stringify({
            workspaceId,
            summary: input.summary,
            startDateTime: input.start.toISOString(),
            endDateTime: input.end.toISOString(),
            description: input.agenda,
            location: input.location,
            attendees: input.guests,
            generateMeetLink: input.generateMeetLink,
            addAsTask: input.addAsTask,
          }),
        },
        workspaceId,
      );
      if (!res.ok) throw new Error("Failed to create event");
      router.refresh();
    },
    [backendFetch, workspaceId, router],
  );

  const value = useMemo<InteractionsCtx>(
    () => ({
      openItem: (d) => setDetail(d),
      openCreate: (at) => canWrite && isGoogleConnected && setCreateAt(at),
      rescheduleTask,
      canWrite,
    }),
    [rescheduleTask, canWrite, isGoogleConnected],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <AnimatePresence>
        {detail && (
          <EventPopover
            detail={detail}
            slug={slug}
            canWrite={canWrite}
            onClose={() => setDetail(null)}
            onReschedule={rescheduleTask}
            onDelete={deleteTask}
          />
        )}
        {createAt && (
          <CreateEventPopover
            at={createAt}
            onClose={() => setCreateAt(null)}
            onCreate={createEvent}
          />
        )}
      </AnimatePresence>
    </Ctx.Provider>
  );
}

// ---------------------------------------------------------------------------
// Event popover
// ---------------------------------------------------------------------------

function Shell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div
        className="relative w-full max-w-[420px] rounded-2xl border border-white/[0.1] bg-[#0d0d0d] p-5 shadow-2xl"
        initial={{ scale: 0.96, y: 8 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 8 }}
        transition={{ type: "spring", stiffness: 320, damping: 26 }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

function EventPopover({
  detail,
  slug,
  canWrite,
  onClose,
  onReschedule,
  onDelete,
}: {
  detail: PlannerEventDetail;
  slug: string;
  canWrite: boolean;
  onClose: () => void;
  onReschedule: (taskId: string, newStart: Date) => Promise<void>;
  onDelete: (taskId: string) => Promise<void>;
}) {
  const [startInput, setStartInput] = useState(toLocalInput(detail.start));
  const [busy, setBusy] = useState(false);
  const changed = detail.isTask && toLocalInput(detail.start) !== startInput;

  const timeLabel = new Date(detail.start).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  async function save() {
    setBusy(true);
    try {
      await onReschedule(detail.id, new Date(startInput));
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await onDelete(detail.id);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell onClose={onClose}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="mt-1.5 w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: detail.color }} />
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold text-white/90 leading-tight break-words">{detail.title}</h3>
            <p className="text-[12px] text-white/45 mt-0.5">{timeLabel}</p>
          </div>
        </div>
        <button onClick={onClose} className="text-white/40 hover:text-white/70 transition-colors flex-shrink-0">
          <X size={16} />
        </button>
      </div>

      {/* Meta */}
      <div className="space-y-2.5">
        {detail.location && (
          <div className="flex items-center gap-2 text-[12px] text-white/60">
            <MapPin size={13} className="text-white/35" /> {detail.location}
          </div>
        )}
        {detail.meetLink && (
          <a
            href={detail.meetLink}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-[12px] text-emerald-300 hover:text-emerald-200 transition-colors"
          >
            <Video size={13} /> Join Google Meet
          </a>
        )}
        {detail.threadId && (
          <a
            href={`/${slug}/agent?thread=${detail.threadId}`}
            className="flex items-center gap-2 text-[12px] text-indigo-300 hover:text-indigo-200 transition-colors"
          >
            <Link2 size={13} /> {detail.threadTitle ?? "Linked thread"}
          </a>
        )}

        {detail.attendees && detail.attendees.length > 0 && (
          <div className="pt-1">
            <p className="text-[10px] uppercase tracking-wide text-white/30 mb-1.5">Attendees</p>
            <div className="space-y-1 max-h-[120px] overflow-y-auto">
              {detail.attendees.map((a) => (
                <div key={a.email} className="flex items-center gap-2 text-[12px] text-white/60">
                  <span
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${RSVP_COLOR[a.responseStatus ?? "needsAction"] ?? "bg-white/30"}`}
                    title={a.responseStatus}
                  />
                  <span className="truncate">{a.displayName || a.email}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      {detail.isTask && (
        <div className="mt-4 pt-4 border-t border-white/[0.07] space-y-3">
          {canWrite && (
            <div className="flex items-center gap-2">
              <CalendarClock size={14} className="text-white/35 flex-shrink-0" />
              <input
                type="datetime-local"
                value={startInput}
                onChange={(e) => setStartInput(e.target.value)}
                className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-[12px] text-white/80 focus:outline-none focus:border-white/20 [color-scheme:dark]"
              />
              <button
                disabled={!changed || busy}
                onClick={save}
                className="text-[12px] px-3 py-1.5 rounded-lg bg-white/[0.08] text-white/80 hover:bg-white/[0.14] transition-colors disabled:opacity-40"
              >
                Move
              </button>
            </div>
          )}
          <div className="flex items-center justify-between">
            <a href={`/${slug}/tasks/${detail.id}`} className="flex items-center gap-1.5 text-[12px] text-white/50 hover:text-white/80 transition-colors">
              <ExternalLink size={13} /> Open task
            </a>
            {canWrite && (
              <button
                disabled={busy}
                onClick={remove}
                className="flex items-center gap-1.5 text-[12px] text-red-400/80 hover:text-red-300 transition-colors disabled:opacity-40"
              >
                <Trash2 size={13} /> Delete
              </button>
            )}
          </div>
        </div>
      )}
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Create popover
// ---------------------------------------------------------------------------

function ToggleRow({
  icon,
  label,
  hint,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2.5 w-full text-left"
    >
      <span className="text-white/40 flex-shrink-0">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="text-[12px] text-white/75 block leading-tight">{label}</span>
        {hint && <span className="text-[11px] text-white/35">{hint}</span>}
      </span>
      <span
        className={`w-9 h-5 rounded-full flex-shrink-0 relative transition-colors ${checked ? "bg-white" : "bg-white/[0.12]"}`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${checked ? "left-[18px] bg-black" : "left-0.5 bg-white/70"}`}
        />
      </span>
    </button>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function CreateEventPopover({
  at,
  onClose,
  onCreate,
}: {
  at: Date;
  onClose: () => void;
  onCreate: (input: CreateEventInput) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [startInput, setStartInput] = useState(toLocalInput(at.toISOString()));
  const [durationMin, setDurationMin] = useState(60);
  const [location, setLocation] = useState("");
  const [agenda, setAgenda] = useState("");
  const [guests, setGuests] = useState<string[]>([]);
  const [guestInput, setGuestInput] = useState("");
  const [generateMeetLink, setGenerateMeetLink] = useState(false);
  const [addAsTask, setAddAsTask] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleMeet(v: boolean) {
    setGenerateMeetLink(v);
    if (v) setAddAsTask(true); // a Meet link makes it a meeting → track it as a task
  }

  function addGuest() {
    const e = guestInput.trim().toLowerCase();
    if (!e) return;
    if (!EMAIL_RE.test(e)) { setError("Enter a valid email"); return; }
    if (!guests.includes(e)) setGuests((g) => [...g, e]);
    setGuestInput("");
    setError(null);
  }

  async function submit() {
    if (!title.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const start = new Date(startInput);
      const end = new Date(start.getTime() + durationMin * 60000);
      await onCreate({
        summary: title.trim(),
        start,
        end,
        agenda: agenda.trim() || undefined,
        location: location.trim() || undefined,
        guests: guests.length ? guests : undefined,
        generateMeetLink,
        addAsTask,
      });
      onClose();
    } catch {
      setError("Couldn't create the event. Try again.");
      setBusy(false);
    }
  }

  const inputCls = "w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[13px] text-white/85 placeholder:text-white/30 focus:outline-none focus:border-white/20";

  return (
    <Shell onClose={onClose}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[15px] font-semibold text-white/90">New event</h3>
        <button onClick={onClose} className="text-white/40 hover:text-white/70 transition-colors">
          <X size={16} />
        </button>
      </div>
      <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-0.5">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Event title"
          className={inputCls}
        />

        <div className="flex items-center gap-2">
          <input
            type="datetime-local"
            value={startInput}
            onChange={(e) => setStartInput(e.target.value)}
            className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-2 text-[12px] text-white/80 focus:outline-none focus:border-white/20 [color-scheme:dark]"
          />
          <select
            value={durationMin}
            onChange={(e) => setDurationMin(Number(e.target.value))}
            className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-2 text-[12px] text-white/80 focus:outline-none focus:border-white/20 [color-scheme:dark]"
          >
            <option value={15}>15m</option>
            <option value={30}>30m</option>
            <option value={60}>1h</option>
            <option value={90}>1.5h</option>
            <option value={120}>2h</option>
          </select>
        </div>

        {/* Toggles */}
        <div className="space-y-2.5 py-1 px-0.5">
          <ToggleRow
            icon={<Video size={14} />}
            label="Add Google Meet"
            hint={generateMeetLink ? "A Meet link will be generated" : undefined}
            checked={generateMeetLink}
            onChange={toggleMeet}
          />
          <ToggleRow
            icon={<ListTodo size={14} />}
            label="Track as a task"
            hint="Show in Tasks + link work to it"
            checked={addAsTask}
            onChange={setAddAsTask}
          />
        </div>

        {/* Guests */}
        <div>
          <div className="flex items-center gap-2 mb-1.5 text-[11px] uppercase tracking-wide text-white/30">
            <Users size={12} /> Guests
          </div>
          {guests.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {guests.map((g) => (
                <span key={g} className="flex items-center gap-1 bg-white/[0.06] border border-white/[0.1] rounded-full pl-2.5 pr-1 py-0.5 text-[11px] text-white/70">
                  {g}
                  <button onClick={() => setGuests((prev) => prev.filter((x) => x !== g))} className="text-white/40 hover:text-white/80">
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <input
            value={guestInput}
            onChange={(e) => setGuestInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addGuest(); } }}
            onBlur={addGuest}
            placeholder="guest@email.com"
            className={inputCls}
          />
        </div>

        <textarea
          value={agenda}
          onChange={(e) => setAgenda(e.target.value)}
          placeholder="Agenda / description (optional)"
          rows={2}
          className={`${inputCls} resize-none`}
        />

        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Location (optional)"
          className={inputCls}
        />

        {error && <p className="text-[11px] text-red-400">{error}</p>}

        <button
          disabled={!title.trim() || busy}
          onClick={submit}
          className="w-full py-2 rounded-lg bg-white text-black text-[13px] font-medium hover:bg-white/90 transition-colors disabled:opacity-40"
        >
          {busy ? "Creating…" : "Create event"}
        </button>
      </div>
    </Shell>
  );
}
