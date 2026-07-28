"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, RefreshCw, ChevronRight, Home } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { AgentActionCard, type AgentActionView } from "@/components/agent/agent-action-card";

export function AgentFeed({ actions }: { actions: AgentActionView[] }) {
  const router = useRouter();
  const [scanNote, setScanNote] = useState<string | null>(null);

  const scan = trpc.agentAction.scanNow.useMutation({
    onSuccess: (res) => {
      setScanNote(res.created > 0 ? `Found ${res.created} new suggestion(s).` : "No new suggestions right now.");
      router.refresh();
    },
    onError: (e) => setScanNote(e.message),
  });

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <nav className="flex items-center gap-1.5">
          <Home size={12} className="text-white/30" />
          <ChevronRight size={12} className="text-white/20" />
          <span className="text-[13px] text-white/40">Agent</span>
        </nav>
        <button
          onClick={() => scan.mutate()}
          disabled={scan.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.12] text-[12px] text-white/60 hover:bg-white/[0.06] hover:text-white/90 transition-colors disabled:opacity-40"
        >
          <RefreshCw size={12} className={scan.isPending ? "animate-spin" : ""} />
          {scan.isPending ? "Checking…" : "Check my calendar"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="max-w-[640px] mx-auto">
          <div className="mb-4">
            <h1 className="text-[18px] font-semibold text-white/90">Proposed actions</h1>
            <p className="text-[13px] text-white/45 mt-1">
              Khove reviewed your calendar and drafted these. Nothing runs until you approve.
            </p>
            {scanNote && <p className="text-[12px] text-teal-300/90 mt-2">{scanNote}</p>}
          </div>

          {actions.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-20 gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center">
                <Bot size={22} className="text-white/30" />
              </div>
              <p className="text-[14px] text-white/60">You&apos;re all caught up</p>
              <p className="text-[12px] text-white/35 max-w-[320px]">
                No suggestions right now. Khove scans every morning — or check now.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {actions.map((a) => (
                <AgentActionCard key={a.id} action={a} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
