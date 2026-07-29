"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { usePagedList, SearchBar, Pager } from "@/components/integrations/list-controls";

const STATES = [
  { k: "open", l: "Open" },
  { k: "closed", l: "Closed" },
  { k: "all", l: "All" },
] as const;

const STATE_CHIP: Record<string, { label: string; color: string }> = {
  open: { label: "Open", color: "#10b981" },
  closed: { label: "Closed", color: "#a1a1aa" },
  merged: { label: "Merged", color: "#8b5cf6" },
};

export function GithubItemsView({ kind }: { kind: "pr" | "issue" }) {
  const [state, setState] = useState<"open" | "closed" | "all">("open");
  const q = trpc.metrics.githubItems.useQuery({ kind, state });
  const rows = q.data ?? [];
  const title = kind === "pr" ? "Pull requests" : "Issues";
  const { term, setTerm, page, setPage, pageCount, total, paged } = usePagedList(
    rows,
    (r) => `${r.title} ${r.repo} ${r.author ?? ""} #${r.number}`,
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="w-full px-6 py-6 xl:px-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h1 className="text-[16px] font-semibold text-white">{title}</h1>
            <span className="text-[12px] text-white/35">{q.isLoading ? "…" : total}</span>
          </div>
          <div className="flex items-center gap-2">
            <SearchBar value={term} onChange={setTerm} placeholder={`Search ${kind === "pr" ? "PRs" : "issues"}…`} />
            <div className="flex items-center gap-0.5 rounded-lg border border-white/[0.08] p-0.5">
              {STATES.map((s) => (
                <button
                  key={s.k}
                  onClick={() => setState(s.k)}
                  className={`rounded-md px-2.5 py-1 text-[12px] transition-colors ${
                    state === s.k ? "bg-white/[0.08] text-white" : "text-white/45 hover:text-white/75"
                  }`}
                >
                  {s.l}
                </button>
              ))}
            </div>
          </div>
        </div>

        {q.isLoading ? (
          <div className="rounded-xl border border-white/[0.07] py-12 text-center text-[13px] text-white/30">Loading from GitHub…</div>
        ) : total === 0 ? (
          <div className="rounded-xl border border-white/[0.07] py-12 text-center text-[13px] text-white/30">
            {term ? "No matches." : `No ${state === "all" ? "" : state} ${kind === "pr" ? "pull requests" : "issues"}.`}
          </div>
        ) : (
          <div className="space-y-1.5">
            {paged.map((r) => {
              const chip = STATE_CHIP[r.state] ?? STATE_CHIP.open;
              const inner = (
                <div className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 transition-colors hover:bg-white/[0.04]">
                  <span className="font-mono text-[11px] text-white/35">#{r.number}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] text-white/85">{r.title}</div>
                    <div className="mt-0.5 text-[11px] text-white/35">
                      {r.repo}
                      {r.author ? ` · ${r.author}` : ""}
                      {r.draft ? " · draft" : ""}
                    </div>
                  </div>
                  {kind === "issue" && r.labels.length > 0 && (
                    <div className="hidden flex-wrap gap-1 md:flex">
                      {r.labels.slice(0, 3).map((l) => (
                        <span key={l} className="rounded border border-white/[0.08] px-1.5 py-0.5 text-[10px] text-white/45">{l}</span>
                      ))}
                    </div>
                  )}
                  <span className="rounded-full px-2 py-0.5 text-[10.5px]" style={{ backgroundColor: `${chip.color}1a`, color: chip.color }}>
                    {chip.label}
                  </span>
                </div>
              );
              return r.url ? (
                <a key={r.id} href={r.url} target="_blank" rel="noreferrer" className="block">{inner}</a>
              ) : (
                <div key={r.id}>{inner}</div>
              );
            })}
          </div>
        )}
        <Pager page={page} pageCount={pageCount} onPage={setPage} />
      </div>
    </div>
  );
}
