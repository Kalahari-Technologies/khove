import { redirect } from "next/navigation";
import Link from "next/link";
import { serverTRPC } from "@/lib/trpc/server";

const SOURCE_DOT: Record<string, string> = {
  JIRA: "#6366f1",
  GITHUB: "#10b981",
  GOOGLE_CALENDAR: "#f43f5e",
  KHOVE: "#94a3b8",
  AI: "#94a3b8",
};

function sourceOf(sources: string[]): string {
  return sources.find((s) => SOURCE_DOT[s]) ?? "KHOVE";
}

export default async function BacklogPage({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace: slug } = await params;
  const base = await serverTRPC();
  const ws = await base.workspace.getBySlug.query({ slug }).catch(() => null);
  if (!ws) redirect("/login");

  const trpc = await serverTRPC(ws.id);
  const tasks = (await trpc.task.list.query({ limit: 200 })).items;
  const backlog = tasks
    .filter((t) => !t.dueDate)
    .map((t) => ({
      id: t.id,
      title: t.title,
      source: sourceOf(t.source),
      status: t.status ? { name: t.status.name, color: t.status.color } : null,
      url: t.externalUrl,
    }));

  return (
    <div className="h-full overflow-y-auto">
      <div className="w-full px-6 py-6 xl:px-10">
        <div className="mb-4 flex items-center gap-2">
          <h1 className="text-[16px] font-semibold text-white">Backlog</h1>
          <span className="text-[12px] text-white/35">{backlog.length}</span>
        </div>
        <p className="mb-4 text-[12.5px] text-white/40">Unscheduled work — tasks with no date. Give one a due date to put it on the calendar.</p>
        {backlog.length === 0 ? (
          <div className="rounded-xl border border-white/[0.07] py-12 text-center text-[13px] text-white/30">Nothing in the backlog — everything is scheduled.</div>
        ) : (
          <div className="space-y-1.5">
            {backlog.map((b) => (
              <div key={b.id} className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5">
                <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: SOURCE_DOT[b.source] }} />
                <Link href={`/${slug}/tasks/${b.id}`} className="min-w-0 flex-1 truncate text-[13px] text-white/85 hover:text-white">
                  {b.title.replace(/^\[[^\]]+\]\s*/, "")}
                </Link>
                {b.status && (
                  <span className="flex-shrink-0 text-[11px]" style={{ color: b.status.color }}>
                    {b.status.name}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
