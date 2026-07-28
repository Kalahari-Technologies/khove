"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useBackendFetch } from "@/lib/trpc/api";
import { Loader2, Lock, Search, X, Check } from "lucide-react";

interface RepoOption {
  fullName: string;
  private: boolean;
}

/**
 * Choose which repositories make up THIS workspace's product — the scope that
 * makes every metric meaningful. Saving re-syncs against the new boundary.
 */
export function GitHubScopeDialog({
  workspaceId,
  onClose,
}: {
  workspaceId: string;
  onClose: () => void;
}) {
  const backendFetch = useBackendFetch();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [repos, setRepos] = useState<RepoOption[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await backendFetch(`/api/integrations/github/repos?workspaceId=${workspaceId}`, {}, workspaceId);
        const data = (await res.json()) as { repos?: RepoOption[]; selected?: string[] };
        setRepos(data.repos ?? []);
        setSelected(new Set(data.selected ?? []));
      } catch {
        setError("Couldn't load your repositories.");
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const filtered = repos.filter((r) => r.fullName.toLowerCase().includes(query.toLowerCase()));
  const allSelected = repos.length > 0 && selected.size === 0; // empty = "all"

  function toggle(fullName: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(fullName) ? next.delete(fullName) : next.add(fullName);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      await backendFetch(
        "/api/integrations/github/scope",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, repos: [...selected] }) },
        workspaceId,
      );
      onClose();
      setTimeout(() => router.refresh(), 3500);
    } catch {
      setError("Couldn't save your selection.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-white/[0.1] bg-[#0d0d0d] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-3">
          <div>
            <h3 className="text-[15px] font-semibold text-white">Repository scope</h3>
            <p className="text-[12px] text-white/45 mt-1 leading-relaxed">
              Pick the repos that make up this workspace&apos;s product. Metrics and the Shepherd
              only watch these. Leave all unchecked to include every repo.
            </p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Search + quick toggles */}
        <div className="px-5 pb-2 flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 px-3 h-8 rounded-lg bg-white/[0.05] border border-white/[0.09]">
            <Search size={12} className="text-white/40" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter repositories…"
              className="flex-1 bg-transparent text-[12.5px] text-white/80 placeholder:text-white/30 outline-none"
            />
          </div>
          <button
            onClick={() => setSelected(new Set())}
            className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${
              allSelected ? "border-emerald-400/30 text-emerald-300" : "border-white/[0.1] text-white/50 hover:text-white/80"
            }`}
          >
            All
          </button>
        </div>

        {/* Repo list */}
        <div className="max-h-[46vh] overflow-y-auto px-3 py-2">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-white/40">
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : error ? (
            <p className="text-[12px] text-red-300/80 px-2 py-6 text-center">{error}</p>
          ) : filtered.length === 0 ? (
            <p className="text-[12px] text-white/35 px-2 py-6 text-center">No repositories match.</p>
          ) : (
            filtered.map((r) => {
              const checked = selected.has(r.fullName);
              return (
                <button
                  key={r.fullName}
                  onClick={() => toggle(r.fullName)}
                  className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg hover:bg-white/[0.04] transition-colors text-left"
                >
                  <span
                    className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border ${
                      checked ? "bg-emerald-400 border-emerald-400" : "border-white/20"
                    }`}
                  >
                    {checked && <Check size={11} className="text-black" strokeWidth={3} />}
                  </span>
                  <span className="text-[13px] text-white/80 truncate flex-1">{r.fullName}</span>
                  {r.private && <Lock size={11} className="text-white/30 flex-shrink-0" />}
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-white/[0.07]">
          <span className="text-[11px] text-white/40">
            {selected.size === 0 ? `All ${repos.length} repos` : `${selected.size} selected`}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="text-[12px] px-3 py-1.5 rounded-lg text-white/50 hover:text-white/80 transition-colors">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving || loading}
              className="flex items-center gap-1.5 text-[12px] px-3.5 py-1.5 rounded-lg bg-white text-black font-medium hover:bg-white/90 transition-colors disabled:opacity-50"
            >
              {saving && <Loader2 size={12} className="animate-spin" />}
              {saving ? "Saving…" : "Save & re-sync"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
