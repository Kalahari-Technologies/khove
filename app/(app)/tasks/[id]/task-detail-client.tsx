"use client";

import Link from "next/link";
import { Home, ChevronRight, ArrowLeft, Calendar, User } from "lucide-react";
import type { TaskWithDetails } from "@/lib/types";
import { useRouter } from "next/navigation";

// ─── Priority Badge ───────────────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: string }) {
  const styles: Record<string, string> = {
    URGENT: "bg-white text-black",
    HIGH:   "bg-white/[0.10] text-white/80",
    MEDIUM: "bg-white/[0.06] text-white/55",
    LOW:    "bg-white/[0.04] text-white/35",
  };
  const labels: Record<string, string> = {
    URGENT: "Urgent",
    HIGH:   "High",
    MEDIUM: "Medium",
    LOW:    "Low",
  };
  return (
    <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded ${styles[priority] ?? "bg-white/[0.04] text-white/35"}`}>
      {labels[priority] ?? priority}
    </span>
  );
}

// ─── Meta Row ─────────────────────────────────────────────────────────────────

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 py-3 border-b border-white/[0.06]">
      <span className="text-[12px] text-white/35 w-28 flex-shrink-0">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function TaskDetailClient({ task }: { task: TaskWithDetails }) {
  const router = useRouter();
  const titleTruncated = task.title.length > 40 ? task.title.slice(0, 40) + "…" : task.title;

  const sourceLabels: Record<string, string> = {
    KHOVE:           "Khove",
    AI:              "Khove",
    GITHUB:          "GitHub",
    JIRA:            "Jira",
    GOOGLE_CALENDAR: "Calendar",
  };
  const sourceIcons: Record<string, string> = {
    KHOVE:           "/assets/khove-rounded.png",
    AI:              "/assets/khove-rounded.png",
    GOOGLE_CALENDAR: "/assets/google-calendar.svg",
    GITHUB:          "/assets/github.svg",
    JIRA:            "/assets/jira.svg",
  };

  const metadata = (task.metadata ?? {}) as Record<string, unknown>;
  const gcalMeta = metadata.googleCalendar as Record<string, unknown> | undefined;

  return (
    <div className="h-full flex flex-col bg-black overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.07] flex-shrink-0">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-[13px]">
          <Link href="/" className="text-white/35 hover:text-white/60 transition-colors duration-[120ms] flex items-center">
            <Home size={13} strokeWidth={1.75} />
          </Link>
          <ChevronRight size={11} className="text-white/20" strokeWidth={2} />
          <Link href="/tasks" className="text-white/40 hover:text-white/70 transition-colors duration-[120ms]">
            Tasks
          </Link>
          <ChevronRight size={11} className="text-white/20" strokeWidth={2} />
          <span className="text-white/80">{titleTruncated}</span>
        </nav>

        <div
          onClick={()=> router.back()}
          className="flex items-center cursor-pointer gap-1.5 text-[12px] text-white/40 hover:text-white/70 transition-colors duration-[120ms]"
        >
          <ArrowLeft size={13} strokeWidth={1.75} />
          Back
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 max-w-2xl mx-auto w-full px-6 py-8">
        {/* Title */}
        <h1 className="text-[22px] font-semibold text-white leading-snug tracking-tight mb-6">
          {task.title}
        </h1>

        {/* Description */}
        {task.description && (
          <div className="mb-6 pb-6 border-b border-white/[0.06]">
            <p className="text-[13px] text-white/65 leading-relaxed whitespace-pre-wrap">
              {task.description.split(/([@#]\w+)/g).map((tok: string, i: number) =>
                /^[@#]\w+/.test(tok)
                  ? <span key={i} className="text-blue-400">{tok}</span>
                  : tok
              )}
            </p>
          </div>
        )}

        {/* Meta fields */}
        <div className="border-t border-white/[0.06]">
          {/* Status */}
          <MetaRow label="Status">
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: task.status?.color ?? "#71717A" }}
              />
              <span className="text-[13px] text-white/70">{task.status?.name ?? "No status"}</span>
            </div>
          </MetaRow>

          {/* Priority */}
          <MetaRow label="Priority">
            <PriorityBadge priority={task.priority} />
          </MetaRow>

          {/* Source */}
          <MetaRow label="Source">
            <div className="flex items-center gap-1.5 flex-wrap">
              {task.source.map((s) => (
                <span key={s} className="flex items-center gap-1 text-[11px] text-white/40 border border-white/[0.08] rounded px-1.5 py-0.5 leading-none">
                  {sourceIcons[s] && <img src={sourceIcons[s]} alt="" width={10} height={10} className="flex-shrink-0" />}
                  {sourceLabels[s] ?? s}
                </span>
              ))}
            </div>
          </MetaRow>

          {/* Due date */}
          <MetaRow label="Due date">
            {task.dueDate ? (
              <div className="flex items-center gap-2">
                <Calendar size={13} strokeWidth={1.75} className="text-white/30" />
                <span className="text-[13px] text-white/65">
                  {new Date(task.dueDate).toLocaleDateString("en-GB", {
                    weekday: "short",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              </div>
            ) : (
              <span className="text-[13px] text-white/25">No due date</span>
            )}
          </MetaRow>

          {/* Assignees */}
          {(task.assignees ?? []).length > 0 && (
            <MetaRow label="Assignees">
              <div className="flex flex-wrap gap-2">
                {(task.assignees ?? []).map((a) => (
                  <div key={a.user.id} className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-full bg-white/[0.10] border border-white/[0.12] flex items-center justify-center">
                      <User size={10} strokeWidth={2} className="text-white/50" />
                    </div>
                    <span className="text-[12px] text-white/60">
                      {a.user.name ?? a.user.email.split("@")[0]}
                    </span>
                    <span className="text-[10px] text-white/25 capitalize">{a.role.toLowerCase()}</span>
                  </div>
                ))}
              </div>
            </MetaRow>
          )}

          {/* Created */}
          <MetaRow label="Created">
            <span className="text-[13px] text-white/40">
              {new Date(task.createdAt).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
          </MetaRow>

          {/* External link */}
          {task.externalUrl && (
            <MetaRow label="External link">
              <a
                href={task.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[13px] text-white/50 hover:text-white/80 underline underline-offset-2 transition-colors duration-[120ms]"
              >
                Open in {sourceLabels[task.source[0]] ?? "external app"}
              </a>
            </MetaRow>
          )}

          {/* ── Google Calendar Metadata ──────────────────────────── */}
          {gcalMeta && task.source.includes("GOOGLE_CALENDAR") && (
            <>
              {gcalMeta.meetLink && (
                <MetaRow label="Meet link">
                  <a
                    href={gcalMeta.meetLink as string}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-[13px] text-white/50 hover:text-white/80 underline underline-offset-2 transition-colors"
                  >
                    <img src="/assets/google-meet.svg" alt="" width={13} height={13} />
                    Join meeting
                  </a>
                </MetaRow>
              )}
              {gcalMeta.location && (
                <MetaRow label="Location">
                  <span className="text-[13px] text-white/65">{gcalMeta.location as string}</span>
                </MetaRow>
              )}
              {(gcalMeta.attendees as string[] | undefined)?.length ? (
                <MetaRow label="Attendees">
                  <div className="flex flex-wrap gap-1.5">
                    {(gcalMeta.attendees as string[]).map((email) => (
                      <span key={email} className="text-[11px] text-white/50 bg-white/[0.04] border border-white/[0.08] rounded-full px-2 py-0.5">
                        {email}
                      </span>
                    ))}
                  </div>
                </MetaRow>
              ) : null}
              {task.dueDate && (
                <MetaRow label="Meeting Starts">
                  <span className="text-[13px] text-white/65">
                    {new Date(task.dueDate).toLocaleString("en-US", {
                      weekday: "short", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short",
                    })}
                  </span>
                </MetaRow>
              )}
              {gcalMeta.endDateTime && (
                <MetaRow label="Meeting Ends">
                  <span className="text-[13px] text-white/65">
                    {new Date(gcalMeta.endDateTime as string).toLocaleString("en-US", {
                      weekday: "short", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short",
                    })}
                  </span>
                </MetaRow>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
