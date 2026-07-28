"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { useBackendFetch } from "@/lib/trpc/api";

const ease = "cubic-bezier(0.16, 1, 0.3, 1)";

interface Member {
  userId: string;
  name: string | null;
  email: string;
  role: string;
  joinedAt: string;
}

interface MembersManagerProps {
  workspaceId: string;
  currentUserId: string;
  currentUserRole: string;
  members: Member[];
}

export function MembersManager({
  workspaceId,
  currentUserId,
  currentUserRole,
  members: initialMembers,
}: MembersManagerProps) {
  const backendFetch = useBackendFetch();
  const [members, setMembers] = useState(initialMembers);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"MEMBER" | "ADMIN" | "VIEWER">("MEMBER");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const canManage = currentUserRole === "OWNER" || currentUserRole === "ADMIN";

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    setInviting(true);
    setError(null);

    try {
      const res = await backendFetch("/trpc/workspace.inviteMember", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify({
          json: { email: inviteEmail.trim(), role: inviteRole },
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data?.error?.json?.message ?? "Failed to invite member");
        setInviting(false);
        return;
      }

      setInviteEmail("");
      setInviting(false);
      router.refresh();
    } catch {
      setError("Something went wrong");
      setInviting(false);
    }
  }

  async function handleRemove(userId: string) {
    try {
      await backendFetch("/trpc/workspace.removeMember", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify({ json: { userId } }),
      });
      setMembers((prev) => prev.filter((m) => m.userId !== userId));
    } catch {
      // silent
    }
  }

  return (
    <div className="space-y-6">
      {/* Invite form */}
      {canManage && (
        <form onSubmit={handleInvite} className="space-y-3">
          <div className="flex gap-2">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="Invite by email…"
              className="flex-1 h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.10] text-[13px] text-white placeholder:text-white/30 focus:border-white/[0.25] focus:outline-none transition-colors duration-[120ms]"
              style={{ transitionTimingFunction: ease }}
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as "MEMBER" | "ADMIN" | "VIEWER")}
              className="h-9 px-2 rounded-lg bg-white/[0.05] border border-white/[0.10] text-[12px] text-white/70 focus:outline-none"
            >
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
              <option value="VIEWER">Viewer</option>
            </select>
            <button
              type="submit"
              disabled={!inviteEmail.trim() || inviting}
              className="flex items-center gap-1.5 px-3 h-9 rounded-lg bg-white text-black text-[12px] font-medium hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-[120ms]"
              style={{ transitionTimingFunction: ease }}
            >
              <Plus size={12} strokeWidth={2.5} />
              {inviting ? "Inviting…" : "Invite"}
            </button>
          </div>
          {error && <p className="text-[12px] text-red-400">{error}</p>}
        </form>
      )}

      {/* Members list */}
      <div className="space-y-1">
        {members.map((member) => (
          <div
            key={member.userId}
            className="flex items-center justify-between py-3 px-3 rounded-lg hover:bg-white/[0.03] transition-colors duration-[100ms]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white/[0.08] text-[12px] font-semibold text-white/70 flex-shrink-0 uppercase">
                {(member.name ?? member.email)[0]}
              </div>
              <div className="min-w-0">
                <p className="text-[13px] text-white/85 truncate">
                  {member.name ?? member.email.split("@")[0]}
                  {member.userId === currentUserId && (
                    <span className="text-white/30 ml-1">(you)</span>
                  )}
                </p>
                <p className="text-[11px] text-white/40 truncate">{member.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-[10px] font-semibold tracking-wide uppercase text-white/35 border border-white/[0.10] rounded px-1.5 py-0.5">
                {member.role}
              </span>

              {canManage &&
                member.role !== "OWNER" &&
                member.userId !== currentUserId && (
                  <button
                    onClick={() => handleRemove(member.userId)}
                    className="flex items-center justify-center w-6 h-6 rounded-md text-white/25 hover:text-red-400 hover:bg-red-400/10 transition-all duration-[120ms]"
                    style={{ transitionTimingFunction: ease }}
                    title="Remove member"
                  >
                    <Trash2 size={12} strokeWidth={2} />
                  </button>
                )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
