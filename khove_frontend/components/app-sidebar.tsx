"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { useConversations } from "@/lib/conversations/conversations-context";
import {
  Bot,
  Target,
  Waypoints,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  Search,
  Filter,
  Clock,
  LayoutGrid,
  List,
  SquareKanban,
  Users,
  CalendarDays,
  Pencil,
} from "lucide-react";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { CreateWorkspaceDialog } from "@/components/create-workspace-dialog";

// ─── Easing ───────────────────────────────────────────────────────────────────
const ease = "cubic-bezier(0.16, 1, 0.3, 1)";

// ─── Types ────────────────────────────────────────────────────────────────────

interface User {
  name: string | null;
  email: string;
  planTier: string;
}

interface WorkspaceInfo {
  id: string;
  slug: string;
  name: string;
  isPersonal: boolean;
  gradient: string;
}

interface WorkspaceListItem extends WorkspaceInfo {
  role: string;
  planTier: string;
}

interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
}

interface NavItem {
  id: string;
  path: string; // relative path (e.g. "/chat") — prefixed with workspace slug at render
  icon?: React.ElementType;
  assets?: [string, string];
  label: string;
  locked: boolean;
  lockedLabel?: string;
  glowColor: string; // primary color for active glow
}

interface DetailItem {
  label: string;
  href?: string;
  icon?: React.ElementType;
  action?: boolean;
  sub?: string;
}

interface DetailSection {
  title?: string;
  items: DetailItem[];
}

// ─── Nav Definition ───────────────────────────────────────────────────────────

const NAV_ITEMS: NavItem[] = [
  { id: "chat",     path: "/chat",     assets: ["/assets/chat.svg", "/assets/chat-outlined.svg"],         label: "Chat",     locked: false, glowColor: "#8B5CF6" },       // violet
  { id: "connections", path: "/connections", icon: Waypoints, label: "Connections", locked: false, glowColor: "#D946EF" }, // fuchsia
  { id: "tasks",    path: "/tasks",    assets: ["/assets/tasks.svg", "/assets/tasks-outlined.svg"],       label: "Tasks",    locked: false, glowColor: "#0EA5E9" },       // ocean blue
  { id: "planner",  path: "/planner",  assets: ["/assets/planner.svg", "/assets/planner-outlined.svg"],   label: "Planner",  locked: false, glowColor: "#F43F5E" },       // rose
  { id: "github",   path: "/github",   assets: ["/assets/github.svg", "/assets/github.svg"],             label: "GitHub",   locked: false, glowColor: "#10B981" },       // emerald
  { id: "initiatives", path: "/initiatives", icon: Target, label: "Delivery", locked: false, glowColor: "#22D3EE" }, // cyan
  { id: "agent",    path: "/agent",    icon: Bot,      label: "Agent",    locked: false, glowColor: "#14B8A6" },       // teal
  { id: "jira",     path: "/jira",     assets: ["/assets/jira.svg", "/assets/jira.svg"], label: "Jira", locked: false, glowColor: "#6366F1" }, // indigo
];

const SETTINGS_GLOW = "#F59E0B"; // amber

// ─── Helpers ──────────────────────────────────────────────────────────────────

function wsHref(slug: string, path: string) {
  return `/${slug}${path}`;
}

function getActiveSection(pathname: string, slug: string): string {
  // Strip workspace slug prefix to get the relative path
  const prefix = `/${slug}`;
  const relative = pathname.startsWith(prefix)
    ? pathname.slice(prefix.length) || "/"
    : pathname;

  const match = NAV_ITEMS.find((item) => relative.startsWith(item.path));
  if (match) return match.id;
  if (relative.startsWith("/settings")) return "settings";
  return "chat";
}

// ─── Detail Panel Content ─────────────────────────────────────────────────────

function getSections(section: string, slug: string): { title: string; sections: DetailSection[] } {
  const map: Record<string, { title: string; sections: DetailSection[] }> = {
    chat: {
      title: "Ask Khove",
      sections: [
        {
          title: "Quick Actions",
          items: [{ label: "New conversation", icon: Plus, action: true }],
        },
        {
          title: "Suggested",
          items: [
            { label: "What tasks do I have today?" },
            { label: "Show my blocked tasks" },
            { label: "Create a task for code review" },
            { label: "Summarise this week's work" },
          ],
        },
        {
          title: "Recent",
          items: [], // populated dynamically from recentConversations prop
        },
      ],
    },
    tasks: {
      title: "My Tasks",
      sections: [
        {
          title: "Quick Actions",
          items: [
            { label: "New task", icon: Plus, action: true },
            { label: "Filter", icon: Filter, action: true },
          ],
        },
        {
          title: "Views",
          items: [
            { label: "All tasks",      href: wsHref(slug, "/tasks"),                        icon: List },
            { label: "In progress",    href: wsHref(slug, "/tasks?status=in_progress"),     icon: Clock },
            { label: "Assigned to me", href: wsHref(slug, "/tasks?mine=true"),              icon: Users },
          ],
        },
        {
          title: "Status",
          items: [
            { label: "Not started" },
            { label: "In progress" },
            { label: "In review" },
            { label: "Blocked" },
            { label: "Done" },
          ],
        },
      ],
    },
    planner: {
      title: "Planner",
      sections: [
        {
          title: "Views",
          items: [
            { label: "Month", icon: LayoutGrid, href: wsHref(slug, "/planner?view=month") },
            { label: "Week",  icon: CalendarDays, href: wsHref(slug, "/planner?view=week") },
            { label: "Day",   icon: List, href: wsHref(slug, "/planner?view=day") },
          ],
        },
        {
          title: "Show",
          items: [
            { label: "Tasks with due dates" },
            { label: "Google Calendar events", sub: "Phase 3" },
          ],
        },
      ],
    },
    github: {
      title: "GitHub",
      sections: [
        {
          title: "Quick Actions",
          items: [
            { label: "Connect GitHub", icon: Plus, action: true },
          ],
        },
        {
          title: "Views",
          items: [
            { label: "Dashboard", href: wsHref(slug, "/github"), icon: LayoutGrid },
            { label: "Pull requests", href: wsHref(slug, "/github/prs"), icon: List },
            { label: "Issues", href: wsHref(slug, "/github/issues"), icon: Clock },
          ],
        },
      ],
    },
    initiatives: {
      title: "Delivery",
      sections: [
        {
          title: "About",
          items: [
            {
              label: "Initiatives are Connectivity Threads with a target date. Khove folds GitHub merges into a burn-up and forecasts whether you'll hit it.",
              sub: "placeholder",
            },
          ],
        },
      ],
    },
    agent: {
      title: "Agent",
      sections: [
        {
          title: "Review",
          items: [
            { label: "Pending approvals", href: wsHref(slug, "/agent"), icon: Bot },
          ],
        },
        {
          title: "About",
          items: [
            { label: "Khove proposes calendar actions from your schedule. Nothing runs until you approve.", sub: "placeholder" },
          ],
        },
      ],
    },
    jira: {
      title: "Jira",
      sections: [
        {
          title: "Views",
          items: [
            { label: "Dashboard", href: wsHref(slug, "/jira"), icon: LayoutGrid },
            { label: "Board", href: wsHref(slug, "/jira/board"), icon: SquareKanban },
            { label: "List", href: wsHref(slug, "/jira/list"), icon: List },
          ],
        },
        {
          title: "About",
          items: [
            { label: "Khove syncs your Jira issues and can create, comment, and transition them from chat.", sub: "placeholder" },
          ],
        },
      ],
    },
  };

  return map[section] ?? map.tasks;
}

// ─── Icon Rail ────────────────────────────────────────────────────────────────

function IconRail({
  activeSection,
  panelCollapsed,
  slug,
  pendingActions,
}: {
  activeSection: string;
  panelCollapsed: boolean;
  slug: string;
  pendingActions: number;
}) {
  return (
    <aside className="relative flex flex-col items-center w-[72px] flex-shrink-0 bg-[#0a0a0a] border-r border-white/[0.07] py-3">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent" />

      {/* Logo mark */}
      <img src="/assets/khove-white.png" alt="Khove" className="w-8 h-8 mb-3 object-cover scale-150 select-none" draggable={false} />

      {/* Nav icons */}
      <nav className="flex flex-col gap-1 w-full px-2 flex-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          const href = item.locked ? "#" : wsHref(slug, item.path);
          return (
            <Link
              key={item.id}
              href={href}
              aria-label={item.label}
              tabIndex={item.locked ? -1 : 0}
              className={[
                "relative flex flex-col items-center justify-center w-full py-2 gap-[12px] rounded-xl transition-all duration-[150ms]",
                isActive
                  ? "text-white"
                  : item.locked
                  ? "text-white/[0.22] cursor-default pointer-events-none"
                  : "text-white/50 hover:text-white/80",
              ].join(" ")}
              style={{ transitionTimingFunction: ease }}
            >
              {/* Active glow — tight colored circle behind icon only */}
              {isActive && (
                <span
                  className="pointer-events-none absolute left-1/2 -translate-x-1/2 -translate-y-1/2 w-[30px] h-[30px] rounded-full blur-[6px]"
                  style={{ backgroundColor: item.glowColor, top: "16px", opacity: 1 }}
                />
              )}

              {item.assets ? (
                <img
                  src={isActive ? item.assets[0] : item.assets[1]}
                  alt={item.label}
                  width={18}
                  height={18}
                  className={`relative flex-shrink-0 transition-opacity duration-[120ms] ${isActive ? "opacity-100 brightness-0 invert" : "opacity-60 brightness-0 invert"}`}
                  draggable={false}
                />
              ) : Icon ? (
                <Icon size={18} strokeWidth={isActive ? 2 : 1.75} className="relative" />
              ) : null}

              <span
                className={[
                  "relative text-[10px] font-medium leading-none tracking-tight",
                  isActive ? "text-white" : item.locked ? "text-white/20" : "text-white/45",
                ].join(" ")}
              >
                {item.label}
              </span>

              {item.locked && (
                <span className="absolute top-1.5 right-1.5 w-1 h-1 rounded-full bg-white/25" />
              )}

              {item.id === "agent" && pendingActions > 0 && (
                <span className="absolute top-1 right-3 min-w-[15px] h-[15px] px-1 flex items-center justify-center rounded-full bg-teal-400 text-black text-[9px] font-bold leading-none">
                  {pendingActions > 9 ? "9+" : pendingActions}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom — settings (+ user only when panel is collapsed) */}
      <div className="flex flex-col gap-1 w-full px-2">
        <Link
          href={wsHref(slug, "/settings")}
          aria-label="Settings"
          title="Settings"
          className={[
            "relative flex flex-col items-center justify-center w-full py-2 gap-1.5 rounded-xl transition-all duration-[150ms]",
            activeSection === "settings"
              ? "text-white"
              : "text-white/50 hover:text-white/80",
          ].join(" ")}
          style={{ transitionTimingFunction: ease }}
        >
          {activeSection === "settings" && (
            <span
              className="pointer-events-none absolute left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full blur-[7px]"
              style={{ backgroundColor: SETTINGS_GLOW, top: "12px", opacity: 0.85 }}
            />
          )}
          <Settings size={18} strokeWidth={1.75} className="relative" />
          <span className={[
            "relative text-[10px] font-medium leading-none tracking-tight",
            activeSection === "settings" ? "text-white" : "text-white/45",
          ].join(" ")}>
            Settings
          </span>
        </Link>

        {panelCollapsed && (
          <div className="flex items-center justify-center w-full py-2 rounded-xl">
            <UserButton appearance={{ elements: { avatarBox: "w-6 h-6" } }} />
          </div>
        )}
      </div>
    </aside>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function DetailPanel({
  activeSection,
  user,
  isCollapsed,
  onToggle,
  slug,
  workspace,
  workspaces,
  onCreateWorkspace,
}: {
  activeSection: string;
  user: User;
  isCollapsed: boolean;
  onToggle: () => void;
  slug: string;
  workspace: WorkspaceInfo;
  workspaces: WorkspaceListItem[];
  onCreateWorkspace: () => void;
}) {
  const router = useRouter();
  const { list: conversations, activeId, rename } = useConversations();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["Quick Actions", "Views", "Suggested", "Recent"])
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const commitRename = () => {
    if (editingId && editValue.trim()) rename(editingId, editValue);
    setEditingId(null);
  };
  const { title, sections } = getSections(activeSection, slug);

  const toggleSection = (name: string) =>
    setExpandedSections((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  return (
    <aside
      className="relative flex flex-col flex-shrink-0 bg-[#0a0a0a] border-r border-white/[0.07] overflow-hidden transition-all duration-[200ms]"
      style={{ width: isCollapsed ? "0px" : "250px", transitionTimingFunction: ease }}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.015] to-transparent" />

      <div className="relative flex flex-col h-full w-full">
        {/* Workspace switcher */}
        <div className="flex items-center px-2 py-3 flex-shrink-0 border-b border-white/[0.07]">
          <WorkspaceSwitcher
            current={workspace}
            workspaces={workspaces}
            onCreateNew={onCreateWorkspace}
          />
        </div>

        {/* Section header */}
        <div className="flex items-center justify-between px-4 h-10 flex-shrink-0">
          <span className="font-display font-semibold text-white text-[14px] tracking-tight truncate">
            {title}
          </span>
          <button
            onClick={onToggle}
            className="flex items-center justify-center w-6 h-6 rounded-md text-white/40 hover:text-white/80 hover:bg-white/[0.07] transition-all duration-[120ms] flex-shrink-0 ml-2"
            style={{ transitionTimingFunction: ease }}
            aria-label="Collapse panel"
          >
            <ChevronLeft size={13} strokeWidth={2} />
          </button>
        </div>

        {/* Search */}
        {(activeSection === "chat" || activeSection === "tasks") && (
          <div className="px-3 mt-3 pb-3 flex-shrink-0">
            <div className="flex items-center gap-2 px-3 h-8 rounded-lg bg-white/[0.05] border border-white/[0.09] hover:border-white/[0.15] transition-colors duration-[120ms]">
              <Search size={12} strokeWidth={2} className="text-white/40 flex-shrink-0" />
              <span className="text-[12px] text-white/35 font-sans select-none">
                {activeSection === "chat" ? "Search conversations…" : "Filter tasks…"}
              </span>
            </div>
          </div>
        )}

        {/* Sections */}
        <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-3">
          {sections.map((section) => {
            const hasTitle = !!section.title;
            const isExpanded = !hasTitle || expandedSections.has(section.title!);

            return (
              <div key={section.title ?? "default"}>
                {hasTitle && (
                  <button
                    onClick={() => toggleSection(section.title!)}
                    className="flex items-center justify-between w-full px-2 py-1 group"
                  >
                    <span className="text-[10px] font-semibold tracking-widest uppercase text-white/45 group-hover:text-white/70 transition-colors duration-[120ms]">
                      {section.title}
                    </span>
                    <ChevronDown
                      size={11}
                      strokeWidth={2.5}
                      className={[
                        "text-white/30 group-hover:text-white/55 transition-all duration-[120ms]",
                        isExpanded ? "rotate-0" : "-rotate-90",
                      ].join(" ")}
                      style={{ transitionTimingFunction: ease }}
                    />
                  </button>
                )}

                {isExpanded && (
                  <div className="mt-0.5 space-y-0.5">
                    {section.title === "Recent" && activeSection === "chat" ? (
                      conversations.length === 0 ? (
                        <p className="px-2 py-2 text-[12px] text-white/30 font-sans leading-relaxed">
                          No conversations yet
                        </p>
                      ) : (
                        conversations.map((conv) => {
                          const isActive = conv.id === activeId;
                          if (editingId === conv.id) {
                            return (
                              <div key={conv.id} className="px-2 py-0.5">
                                <input
                                  autoFocus
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onBlur={commitRename}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") commitRename();
                                    if (e.key === "Escape") setEditingId(null);
                                  }}
                                  className="w-full bg-white/[0.08] border border-white/[0.15] rounded-md px-2 py-[6px] text-[13px] text-white outline-none focus:border-white/30"
                                />
                              </div>
                            );
                          }
                          return (
                            <div key={conv.id} className="relative group/conv">
                              <Link href={wsHref(slug, `/chat?conversationId=${conv.id}`)}>
                                <span
                                  className={[
                                    "flex items-center gap-2 w-full px-2 py-[7px] pr-7 rounded-md text-[13px] font-sans cursor-pointer transition-all duration-[120ms]",
                                    isActive ? "bg-white/[0.08] text-white" : "text-white/65 hover:text-white hover:bg-white/[0.06]",
                                  ].join(" ")}
                                  style={{ transitionTimingFunction: ease }}
                                >
                                  {conv.generating ? (
                                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse flex-shrink-0" title="Generating…" />
                                  ) : conv.unseen ? (
                                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0" title="New reply" />
                                  ) : (
                                    <span className="w-1.5 h-1.5 flex-shrink-0" />
                                  )}
                                  <span className={`truncate flex-1 leading-snug ${conv.unseen && !isActive ? "font-medium text-white/90" : ""}`}>
                                    {conv.title}
                                  </span>
                                </span>
                              </Link>
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setEditingId(conv.id);
                                  setEditValue(conv.title);
                                }}
                                title="Rename"
                                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded text-white/40 opacity-0 group-hover/conv:opacity-100 hover:text-white/80 hover:bg-white/[0.08] transition-all"
                              >
                                <Pencil size={11} />
                              </button>
                            </div>
                          );
                        })
                      )
                    ) : (
                      section.items.map((item) => {
                        const Icon = item.icon;
                        const isPlaceholder = item.sub === "placeholder";

                        if (isPlaceholder) {
                          return (
                            <p key={item.label} className="px-2 py-2 text-[12px] text-white/30 font-sans leading-relaxed">
                              {item.label}
                            </p>
                          );
                        }

                        const inner = (
                          <span
                            className={[
                              "flex items-center gap-2.5 w-full px-2 py-[7px] rounded-md text-[13px] font-sans transition-all duration-[120ms] group",
                              item.action
                                ? "text-white hover:bg-white/[0.08] cursor-pointer"
                                : "text-white/75 hover:text-white hover:bg-white/[0.06] cursor-pointer",
                            ].join(" ")}
                            style={{ transitionTimingFunction: ease }}
                          >
                            {Icon && (
                              <Icon
                                size={13}
                                strokeWidth={1.75}
                                className={item.action ? "text-white/70 group-hover:text-white" : "text-white/45 group-hover:text-white/70"}
                              />
                            )}
                            <span className="truncate flex-1 leading-snug">{item.label}</span>
                            {item.sub && item.sub !== "placeholder" && (
                              <span className="text-[10px] text-white/30 flex-shrink-0 font-medium">{item.sub}</span>
                            )}
                          </span>
                        );

                        return (
                          <div key={item.label}>
                            {item.href ? (
                              <Link href={item.href}>{inner}</Link>
                            ) : (
                              <button
                                type="button"
                                className="w-full text-left"
                                onClick={() => {
                                  if (item.label === "New conversation") router.push(wsHref(slug, "/chat"));
                                }}
                              >
                                {inner}
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* User footer */}
        <div className="flex-shrink-0 border-t border-white/[0.07] px-3 py-3">
          <div className="flex items-center gap-2.5">
            <UserButton appearance={{ elements: { avatarBox: "w-[26px] h-[26px]" } }} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-[12px] font-semibold text-white/90 truncate leading-none">
                  {user.name ?? user.email.split("@")[0]}
                </p>
                <span className="flex-shrink-0 text-[9px] font-semibold tracking-widest uppercase text-white/35 border border-white/[0.12] rounded px-1 py-0.5 leading-none">
                  {user.planTier}
                </span>
              </div>
              <p className="text-[11px] text-white/40 truncate mt-1 leading-none">
                {user.email}
              </p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ─── Expand Toggle ────────────────────────────────────────────────────────────

function ExpandToggle({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Expand panel"
      className="absolute left-[52px] top-[18px] z-10 flex items-center justify-center w-[18px] h-[18px] rounded-full bg-[#1a1a1a] border border-white/[0.15] text-white/50 hover:text-white hover:border-white/30 transition-all duration-[120ms] shadow-sm"
      style={{ transitionTimingFunction: ease }}
    >
      <ChevronRight size={10} strokeWidth={2.5} />
    </button>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function AppSidebar({
  user,
  workspace,
  workspaces = [],
  pendingActions = 0,
}: {
  user: User;
  workspace: WorkspaceInfo;
  workspaces?: WorkspaceListItem[];
  pendingActions?: number;
}) {
  const pathname = usePathname();
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const activeSection = getActiveSection(pathname, workspace.slug);

  return (
    <>
      <div className="relative flex flex-row h-full flex-shrink-0">
        <IconRail
          activeSection={activeSection}
          panelCollapsed={panelCollapsed}
          slug={workspace.slug}
          pendingActions={pendingActions}
        />

        <DetailPanel
          activeSection={activeSection}
          user={user}
          isCollapsed={panelCollapsed}
          onToggle={() => setPanelCollapsed(true)}
          slug={workspace.slug}
          workspace={workspace}
          workspaces={workspaces}
          onCreateWorkspace={() => setShowCreateDialog(true)}
        />

        {panelCollapsed && <ExpandToggle onClick={() => setPanelCollapsed(false)} />}
      </div>

      <CreateWorkspaceDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
      />
    </>
  );
}
