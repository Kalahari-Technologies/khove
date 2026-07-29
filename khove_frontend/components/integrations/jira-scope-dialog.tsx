"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useBackendFetch } from "@/lib/trpc/api";
import { Loader2, Search, X, Check } from "lucide-react";

interface ProjectOption {
  key: string;
  name: string;
}

/**
 * Choose which Jira projects make up THIS workspace's product. The sync, metrics,
 * and dashboard only cover the selected projects; saving re-syncs.
 */
export function JiraScopeDialog({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const backendFetch = useBackendFetch();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await backendFetch(`/api/integrations/jira/projects?workspaceId=${workspaceId}`, {}, workspaceId);
        const data = (await res.json()) as { projects?: ProjectOption[]; selected?: string[] };
        setProjects(data.projects ?? []);
        setSelected(new Set(data.selected ?? []));
      } catch {
        setError("Couldn't load your Jira projects.");
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const filtered = projects.filter(
    (p) => p.name.toLowerCase().includes(query.toLowerCase()) || p.key.toLowerCase().includes(query.toLowerCase()),
  );
  const allSelected = projects.length > 0 && selected.size === 0;

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      await backendFetch(
        "/api/integrations/jira/scope",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, projects: [...selected] }) },
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
      <div className="w-full max-w-md rounded-2xl border border-white/[0.1] bg-[#0d0d0d] shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between px-5 pt-5 pb-3">
          <div>
            <h3 className="text-[15px] font-semibold text-white">Project scope</h3>
            <p className="text-[12px] text-white/45 mt-1 leading-relaxed">
              Pick the Jira projects that make up this workspace&apos;s product. Only these are synced.
              Leave all unchecked to include every project.
            </p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 pb-2 flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 px-3 h-8 rounded-lg bg-white/[0.05] border border-white/[0.09]">
            <Search size={12} className="text-white/40" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter projects…"
              className="flex-1 bg-transparent text-[12.5px] text-white/80 placeholder:text-white/30 outline-none"
            />
          </div>
          <button
            onClick={() => setSelected(new Set())}
            className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${
              allSelected ? "border-indigo-400/30 text-indigo-300" : "border-white/[0.1] text-white/50 hover:text-white/80"
            }`}
          >
            All
          </button>
        </div>

        <div className="max-h-[46vh] overflow-y-auto px-3 py-2">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-white/40">
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : error ? (
            <p className="text-[12px] text-red-300/80 px-2 py-6 text-center">{error}</p>
          ) : filtered.length === 0 ? (
            <p className="text-[12px] text-white/35 px-2 py-6 text-center">No projects match.</p>
          ) : (
            filtered.map((p) => {
              const checked = selected.has(p.key);
              return (
                <button
                  key={p.key}
                  onClick={() => toggle(p.key)}
                  className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg hover:bg-white/[0.04] transition-colors text-left"
                >
                  <span className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border ${checked ? "bg-indigo-400 border-indigo-400" : "border-white/20"}`}>
                    {checked && <Check size={11} className="text-black" strokeWidth={3} />}
                  </span>
                  <span className="text-[13px] text-white/80 truncate flex-1">{p.name}</span>
                  <span className="text-[10.5px] font-mono text-white/35 flex-shrink-0">{p.key}</span>
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-3.5 border-t border-white/[0.07]">
          <span className="text-[11px] text-white/40">
            {selected.size === 0 ? `All ${projects.length} projects` : `${selected.size} selected`}
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
