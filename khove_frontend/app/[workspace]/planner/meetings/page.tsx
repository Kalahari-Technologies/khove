import { redirect } from "next/navigation";
import { serverTRPC } from "@/lib/trpc/server";
import { Video, Users } from "lucide-react";

type GMeta = { isMeeting?: boolean; meetLink?: string | null; attendeeCount?: number; location?: string | null };

function fmtWhen(d: Date): string {
  return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default async function MeetingsPage({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace: slug } = await params;
  const base = await serverTRPC();
  const ws = await base.workspace.getBySlug.query({ slug }).catch(() => null);
  if (!ws) redirect("/login");

  const trpc = await serverTRPC(ws.id);
  const tasks = (await trpc.task.list.query({ source: "GOOGLE_CALENDAR", hasDueDate: true, limit: 200 })).items;
  const now = Date.now();
  const meetings = tasks
    .map((t) => ({ t, g: ((t.metadata as { googleCalendar?: GMeta } | null)?.googleCalendar) ?? {} }))
    .filter(({ g }) => g.isMeeting)
    .map(({ t, g }) => ({
      id: t.id,
      title: t.title,
      when: t.dueDate as Date,
      attendees: g.attendeeCount ?? 0,
      meetLink: g.meetLink ?? null,
      url: t.externalUrl,
    }))
    .sort((a, b) => a.when.getTime() - b.when.getTime());

  const upcoming = meetings.filter((m) => m.when.getTime() >= now);
  const past = meetings.filter((m) => m.when.getTime() < now).reverse();

  const Row = (m: (typeof meetings)[number]) => (
    <div key={m.id} className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5">
      <div className="w-[150px] flex-shrink-0 text-[12px] text-white/45">{fmtWhen(m.when)}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] text-white/85">{m.title.replace(/^\[[^\]]+\]\s*/, "")}</div>
        {m.attendees > 0 && (
          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-white/35">
            <Users size={11} /> {m.attendees}
          </div>
        )}
      </div>
      {m.meetLink && (
        <a href={m.meetLink} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-md border border-white/[0.10] bg-white/[0.04] px-2 py-1 text-[11.5px] text-white/75 hover:bg-white/[0.07]">
          <Video size={12} /> Join
        </a>
      )}
    </div>
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="w-full px-6 py-6 xl:px-10">
        <h1 className="mb-4 text-[16px] font-semibold text-white">Meetings</h1>
        {meetings.length === 0 ? (
          <div className="rounded-xl border border-white/[0.07] py-12 text-center text-[13px] text-white/30">
            No meetings synced. Connect Google Calendar on the planner to see them here.
          </div>
        ) : (
          <div className="space-y-6">
            {upcoming.length > 0 && (
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/35">Upcoming</div>
                <div className="space-y-1.5">{upcoming.map(Row)}</div>
              </div>
            )}
            {past.length > 0 && (
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/35">Past</div>
                <div className="space-y-1.5 opacity-60">{past.slice(0, 30).map(Row)}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
