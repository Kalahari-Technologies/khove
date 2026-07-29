"use client";

import { usePagedList, SearchBar, Pager } from "@/components/integrations/list-controls";

export interface JiraRow {
  id: string;
  key: string;
  title: string;
  type: string;
  status: string;
  category: string;
  epic?: string;
  priority: string;
  url: string | null;
}

const CAT_COLOR: Record<string, string> = { NOT_STARTED: "#64748b", IN_PROGRESS: "#3b82f6", DONE: "#10b981" };

export function JiraListView({ rows }: { rows: JiraRow[] }) {
  const { term, setTerm, page, setPage, pageCount, total, paged } = usePagedList(
    rows,
    (r) => `${r.key} ${r.title} ${r.type} ${r.status} ${r.epic ?? ""}`,
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="w-full px-6 py-6 xl:px-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h1 className="text-[16px] font-semibold text-white">Issues</h1>
            <span className="text-[12px] text-white/35">{total}</span>
          </div>
          <SearchBar value={term} onChange={setTerm} placeholder="Search issues…" />
        </div>
        <div className="overflow-hidden rounded-xl border border-white/[0.07]">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-wide text-white/35">
                <th className="px-3 py-2 font-medium">Key</th>
                <th className="px-3 py-2 font-medium">Summary</th>
                <th className="hidden px-3 py-2 font-medium sm:table-cell">Type</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="hidden px-3 py-2 font-medium md:table-cell">Epic</th>
                <th className="hidden px-3 py-2 font-medium sm:table-cell">Priority</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((r) => (
                <tr key={r.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-white/45">{r.key}</td>
                  <td className="px-3 py-2 text-[13px] text-white/85">
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noreferrer" className="hover:text-white">{r.title}</a>
                    ) : (
                      r.title
                    )}
                  </td>
                  <td className="hidden px-3 py-2 text-[12px] text-white/50 sm:table-cell">{r.type}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-[12px]">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: CAT_COLOR[r.category] ?? "#64748b" }} />
                      <span className="text-white/70">{r.status}</span>
                    </span>
                  </td>
                  <td className="hidden max-w-[180px] truncate px-3 py-2 text-[12px] text-white/50 md:table-cell">{r.epic ?? "—"}</td>
                  <td className="hidden px-3 py-2 text-[12px] text-white/50 sm:table-cell">{r.priority || "—"}</td>
                </tr>
              ))}
              {paged.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-[13px] text-white/30">
                    {term ? "No matches." : "No issues synced yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pager page={page} pageCount={pageCount} onPage={setPage} />
      </div>
    </div>
  );
}
