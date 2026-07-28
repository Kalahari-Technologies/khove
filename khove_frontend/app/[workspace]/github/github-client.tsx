"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace/workspace-context";
import { useBackendFetch, useConnectIntegration } from "@/lib/trpc/api";
import { ExternalLink, GitPullRequest, CircleDot, Unplug } from "lucide-react";

const ease = "cubic-bezier(0.16, 1, 0.3, 1)";

interface GitHubTask {
  id: string;
  title: string;
  status: string;
  statusColor: string;
  externalUrl: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface GitHubClientProps {
  isConnected: boolean;
  canAdmin: boolean;
  workspaceId: string;
  githubLogin: string | null;
  githubAvatar: string | null;
  tasks: GitHubTask[];
}

export function GitHubClient({
  isConnected,
  canAdmin,
  workspaceId,
  githubLogin,
  githubAvatar,
  tasks,
}: GitHubClientProps) {
  const router = useRouter();
  const workspace = useWorkspace();
  const backendFetch = useBackendFetch();
  const connectIntegration = useConnectIntegration();
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      await backendFetch("/api/integrations/github/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      router.refresh();
    } catch {
      // silent
    }
    setDisconnecting(false);
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 px-6">
        <div className="flex flex-col items-center text-center max-w-sm">
          <img src="/assets/github.svg" width={48} height={48} alt="GitHub" className="mb-4" />
          <h2 className="text-[18px] font-semibold text-white mb-2">Connect GitHub</h2>
          <p className="text-[13px] text-white/40 leading-relaxed">
            Track pull requests, issues, and repository activity. Your PRs and issues will appear as tasks in Khove.
          </p>
        </div>
        <button
          onClick={() => connectIntegration("github", workspaceId)}
          className="px-5 py-2.5 rounded-xl text-[13px] font-medium bg-white text-black hover:bg-white/90 transition-colors active:scale-[0.98]"
          style={{ transitionTimingFunction: ease }}
        >
          Connect GitHub
        </button>
      </div>
    );
  }

  const prs = tasks.filter((t) => (t.metadata?.github as Record<string, unknown>)?.type === "pull_request");
  const issues = tasks.filter((t) => (t.metadata?.github as Record<string, unknown>)?.type === "issue");

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto w-full px-6 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {githubAvatar && (
              <img src={githubAvatar} width={32} height={32} alt="" className="rounded-full" />
            )}
            <div>
              <h1 className="text-[18px] font-semibold text-white">GitHub</h1>
              <p className="text-[12px] text-white/40">
                Connected as <span className="text-white/60">@{githubLogin}</span>
              </p>
            </div>
          </div>
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] text-white/40 border border-white/[0.08] hover:text-red-400 hover:border-red-400/20 transition-colors"
            style={{ transitionTimingFunction: ease }}
          >
            <Unplug size={12} />
            {disconnecting ? "Disconnecting..." : "Disconnect"}
          </button>
        </div>

        {/* Pull Requests */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <GitPullRequest size={14} className="text-white/40" />
            <h2 className="text-[13px] font-semibold text-white/70 uppercase tracking-wide">
              Pull Requests
            </h2>
            <span className="text-[11px] text-white/30">{prs.length}</span>
          </div>
          {prs.length === 0 ? (
            <p className="text-[12px] text-white/30 py-4">No pull requests synced yet</p>
          ) : (
            <div className="space-y-1">
              {prs.map((task) => (
                <TaskRow key={task.id} task={task} workspaceSlug={workspace.slug} />
              ))}
            </div>
          )}
        </section>

        {/* Issues */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <CircleDot size={14} className="text-white/40" />
            <h2 className="text-[13px] font-semibold text-white/70 uppercase tracking-wide">
              Issues
            </h2>
            <span className="text-[11px] text-white/30">{issues.length}</span>
          </div>
          {issues.length === 0 ? (
            <p className="text-[12px] text-white/30 py-4">No issues synced yet</p>
          ) : (
            <div className="space-y-1">
              {issues.map((task) => (
                <TaskRow key={task.id} task={task} workspaceSlug={workspace.slug} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function TaskRow({ task, workspaceSlug }: { task: GitHubTask; workspaceSlug: string }) {
  const ghMeta = task.metadata?.github as Record<string, unknown> | undefined;
  const repo = ghMeta?.repo as string | undefined;

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.03] transition-colors group">
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: task.statusColor }}
      />
      <a
        href={`/${workspaceSlug}/tasks/${task.id}`}
        className="flex-1 text-[13px] text-white/80 truncate hover:text-white hover:underline transition-colors"
      >
        {task.title}
      </a>
      {repo && (
        <span className="text-[11px] text-white/25 flex-shrink-0 hidden group-hover:block">
          {repo}
        </span>
      )}
      {task.externalUrl && (
        <a
          href={task.externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/20 hover:text-white/60 transition-colors flex-shrink-0"
        >
          <ExternalLink size={12} />
        </a>
      )}
    </div>
  );
}
