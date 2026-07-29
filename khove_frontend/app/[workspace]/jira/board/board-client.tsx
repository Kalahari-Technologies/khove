"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { trpc } from "@/lib/trpc/client";

export interface BoardCard {
  id: string;
  key: string;
  title: string;
  type: string;
  category: string;
  epic?: string;
  url: string | null;
}

const COLUMNS = [
  { key: "NOT_STARTED", label: "To Do", color: "#64748b" },
  { key: "IN_PROGRESS", label: "In Progress", color: "#3b82f6" },
  { key: "DONE", label: "Done", color: "#10b981" },
] as const;

type Cat = (typeof COLUMNS)[number]["key"];

export function JiraBoardClient({ cards: initial }: { cards: BoardCard[] }) {
  const router = useRouter();
  const [cards, setCards] = useState(initial);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const transition = trpc.jira.transitionIssue.useMutation();

  function handleDrop(e: React.DragEvent, colKey: Cat) {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData("text/cardId");
    const card = cards.find((c) => c.id === id);
    if (!card || card.category === colKey) return;
    const prev = card.category;
    // Optimistic move; revert + toast on failure.
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, category: colKey } : c)));
    setError(null);
    transition.mutate(
      { issueKey: card.key, category: colKey },
      {
        onError: (err) => {
          setCards((cs) => cs.map((c) => (c.id === id ? { ...c, category: prev } : c)));
          setError(err.message || "Couldn't move that issue in Jira.");
          setTimeout(() => setError(null), 5000);
        },
        onSuccess: () => router.refresh(),
      },
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="w-full px-6 py-6 xl:px-10">
        {error && (
          <div className="mb-3 rounded-lg border border-red-500/25 bg-red-500/[0.06] px-3 py-2 text-[12.5px] text-red-300">
            {error}
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {COLUMNS.map((col) => {
            const items = cards.filter((c) => c.category === col.key);
            return (
              <div
                key={col.key}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(col.key);
                }}
                onDragLeave={() => setDragOver((d) => (d === col.key ? null : d))}
                onDrop={(e) => handleDrop(e, col.key)}
                className={`rounded-xl border p-3 transition-colors ${
                  dragOver === col.key ? "border-white/25 bg-white/[0.05]" : "border-white/[0.06] bg-white/[0.015]"
                }`}
              >
                <div className="mb-2.5 flex items-center gap-2 px-1">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: col.color }} />
                  <span className="text-[12.5px] font-semibold text-white/80">{col.label}</span>
                  <span className="text-[11px] text-white/35">{items.length}</span>
                </div>
                <div className="min-h-[44px] space-y-2">
                  {items.map((c) => (
                    <div
                      key={c.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/cardId", c.id)}
                      className="cursor-grab rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2 transition-colors hover:bg-white/[0.05] active:cursor-grabbing"
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <span className="font-mono text-[10.5px] text-white/40">{c.key}</span>
                        {c.type && <span className="text-[10px] text-white/30">{c.type}</span>}
                        {c.url && (
                          <a
                            href={c.url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="ml-auto text-white/25 hover:text-white/60"
                            title="Open in Jira"
                          >
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                      <div className="text-[12.5px] leading-snug text-white/85">{c.title}</div>
                      {c.epic && (
                        <div className="mt-1.5 inline-block rounded border border-indigo-400/20 bg-indigo-400/[0.08] px-1.5 py-0.5 text-[10px] text-indigo-300/80">
                          {c.epic}
                        </div>
                      )}
                    </div>
                  ))}
                  {items.length === 0 && (
                    <div className="px-1 py-4 text-center text-[11.5px] text-white/25">Drop here.</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {transition.isPending && <div className="mt-3 text-[11.5px] text-white/30">Updating Jira…</div>}
      </div>
    </div>
  );
}
