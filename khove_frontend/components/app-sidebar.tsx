"use client";

import { useEffect, useState } from "react";
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
  Clock,
  LayoutDashboard,
  LayoutGrid,
  List,
  SquareKanban,
  GitPullRequest,
  CircleDot,
  Star,
  Users,
  CalendarDays,
  Pencil,
} from "lucide-react";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { CreateWorkspaceDialog } from "@/components/create-workspace-dialog";
import { trpc } from "@/lib/trpc/client";
import { useLocalPref } from "@/lib/dashboard/use-local-pref";

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
  children?: DetailItem[]; // presence makes it a collapsible accordion group
  defaultOpen?: boolean;
}

interface DetailSection {
  title?: string;
  items: DetailItem[];
}

// ─── Nav Definition ───────────────────────────────────────────────────────────

const NAV_ITEMS: NavItem[] = [
  { id: "dashboards", path: "/dashboards", icon: LayoutDashboard, label: "Dashboards", locked: false, glowColor: "#A78BFA" }, // violet-light
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
    dashboards: {
      title: "Dashboards",
      sections: [], // populated dynamically from trpc.dashboard.list in DetailPanel
    },
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
          items: [
            { label: "New task", icon: Plus, action: true },
            { label: "All tasks", href: wsHref(slug, "/tasks"), icon: List },
            { label: "In progress", href: wsHref(slug, "/tasks?status=in_progress"), icon: Clock },
            { label: "Assigned to me", href: wsHref(slug, "/tasks?mine=true"), icon: Users },
          ],
        },
      ],
    },
    planner: {
      title: "Planner",
      sections: [
        {
          items: [
            { label: "Overview", href: wsHref(slug, "/planner"), icon: CalendarDays },
            { label: "Meetings", href: wsHref(slug, "/planner/meetings"), icon: Users },
            { label: "Backlog", href: wsHref(slug, "/planner/backlog"), icon: List },
          ],
        },
      ],
    },
    github: {
      title: "GitHub",
      sections: [
        {
          items: [
            { label: "Dashboard", href: wsHref(slug, "/github"), icon: LayoutGrid },
            { label: "Pull requests", href: wsHref(slug, "/github/prs"), icon: GitPullRequest },
            { label: "Issues", href: wsHref(slug, "/github/issues"), icon: CircleDot },
          ],
        },
      ],
    },
    initiatives: {
      title: "Delivery",
      sections: [
        {
          items: [{ label: "Overview", href: wsHref(slug, "/initiatives"), icon: Target }],
        },
      ],
    },
    agent: {
      title: "Agent",
      sections: [
        {
          items: [{ label: "Pending approvals", href: wsHref(slug, "/agent"), icon: Bot }],
        },
      ],
    },
    jira: {
      title: "Jira",
      sections: [
        {
          items: [
            { label: "Dashboard", href: wsHref(slug, "/jira"), icon: LayoutGrid },
            { label: "Board", href: wsHref(slug, "/jira/board"), icon: SquareKanban },
            { label: "List", href: wsHref(slug, "/jira/list"), icon: List },
          ],
        },
      ],
    },
  };

  return map[section] ?? map.tasks;
}

/** Build the Dashboards drawer from the user's live dashboard list. */
function buildDashboardsSections(
  list: { id: string; name: string; isDefault: boolean }[],
  slug: string,
): DetailSection[] {
  const children: DetailItem[] = list.map((d) => ({
    label: d.name,
    href: wsHref(slug, `/dashboards/${d.id}`),
    icon: d.isDefault ? Star : LayoutGrid,
  }));
  return [
    {
      items: [
        { label: "All dashboards", icon: LayoutDashboard, defaultOpen: true, children },
        { label: "New dashboard", icon: Plus, action: true },
      ],
    },
  ];
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
  const pathname = usePathname();
  const { list: conversations, activeId, rename } = useConversations();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const commitRename = () => {
    if (editingId && editValue.trim()) rename(editingId, editValue);
    setEditingId(null);
  };

  // Dashboards drawer is built from the user's live dashboard list. Fetch on mount
  // (not gated on the section) and render from a localStorage-cached copy so the
  // list appears instantly instead of flashing empty then fetching every visit.
  const [cachedDashboards, setCachedDashboards] = useLocalPref<{ id: string; name: string; isDefault: boolean }[]>(
    workspace.id ? `nav:dashboards:${workspace.id}` : null,
    [],
  );
  const dashboardsQuery = trpc.dashboard.list.useQuery(undefined, {
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  });
  useEffect(() => {
    if (dashboardsQuery.data) {
      setCachedDashboards(dashboardsQuery.data.map((d) => ({ id: d.id, name: d.name, isDefault: d.isDefault })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardsQuery.data]);
  const createDashboard = trpc.dashboard.create.useMutation({
    onSuccess: (r) => {
      dashboardsQuery.refetch();
      router.push(wsHref(slug, `/dashboards/${r.id}`));
    },
  });

  const base = getSections(activeSection, slug);
  const title = base.title;
  const sections =
    activeSection === "dashboards"
      ? buildDashboardsSections(dashboardsQuery.data ?? cachedDashboards, slug)
      : base.sections;

  // Persisted accordion open/closed state, keyed per workspace.
  const [accordion, setAccordion] = useLocalPref<Record<string, boolean>>(
    workspace.id ? `nav:accordion:${workspace.id}` : null,
    {},
  );
  const groupOpen = (item: DetailItem) => accordion[item.label] ?? item.defaultOpen ?? false;
  const toggleGroup = (item: DetailItem) =>
    setAccordion((a) => ({ ...a, [item.label]: !(a[item.label] ?? item.defaultOpen ?? false) }));

  const handleAction = (label: string) => {
    if (label === "New conversation") router.push(wsHref(slug, "/chat"));
    else if (label === "New dashboard") createDashboard.mutate({ name: "New dashboard" });
  };

  // Recursive renderer: leaf items are links/actions; items with `children`
  // render as collapsible accordion groups.
  const renderItem = (item: DetailItem, depth: number): React.ReactNode => {
    const Icon = item.icon;
    if (item.sub === "placeholder") {
      return (
        <p key={item.label} className="px-2 py-2 text-[12px] text-white/30 font-sans leading-relaxed">
          {item.label}
        </p>
      );
    }

    if (item.children) {
      const open = groupOpen(item);
      return (
        <div key={item.label}>
          <button
            type="button"
            onClick={() => toggleGroup(item)}
            className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-[13px] font-sans text-white/70 hover:text-white hover:bg-white/[0.045] transition-colors duration-[120ms] group"
          >
            {Icon && <Icon size={15} strokeWidth={1.75} className="text-white/45 group-hover:text-white/70" />}
            <span className="truncate flex-1 text-left leading-snug">{item.label}</span>
            <ChevronDown
              size={13}
              className={`text-white/35 transition-transform duration-150 ${open ? "" : "-rotate-90"}`}
            />
          </button>
          {open && (
            <div className="mt-0.5 ml-3.5 space-y-0.5 border-l border-white/[0.06] pl-1.5">
              {item.children.length === 0 ? (
                <p className="px-2 py-1.5 text-[11.5px] text-white/25">No dashboards yet</p>
              ) : (
                item.children.map((c) => renderItem(c, depth + 1))
              )}
            </div>
          )}
        </div>
      );
    }

    const active = !!item.href && pathname === item.href;
    const inner = (
      <span
        className={[
          "flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-[13px] font-sans transition-colors duration-[120ms] group",
          active
            ? "bg-white/[0.07] text-white"
            : item.action
              ? "text-white/85 hover:bg-white/[0.06] cursor-pointer"
              : "text-white/65 hover:text-white hover:bg-white/[0.045] cursor-pointer",
        ].join(" ")}
      >
        {Icon && (
          <Icon
            size={15}
            strokeWidth={1.75}
            className={
              active
                ? "text-white"
                : item.action
                  ? "text-white/70 group-hover:text-white"
                  : "text-white/45 group-hover:text-white/70"
            }
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
          <button type="button" className="w-full text-left" onClick={() => handleAction(item.label)}>
            {inner}
          </button>
        )}
      </div>
    );
  };

  return (
    <aside
      className="relative flex flex-col flex-shrink-0 bg-[#0a0a0a] border-r border-white/[0.07] overflow-hidden transition-all duration-[200ms]"
      style={{ width: isCollapsed ? "0px" : "264px", transitionTimingFunction: ease }}
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
        <div className="flex items-center justify-between px-4 h-11 flex-shrink-0">
          <span className="font-display font-semibold text-white text-[15px] tracking-tight truncate">
            {title}
          </span>
          <button
            onClick={onToggle}
            className="flex items-center justify-center w-6 h-6 rounded-md text-white/40 hover:text-white/80 hover:bg-white/[0.07] transition-all duration-[120ms] flex-shrink-0 ml-2"
            style={{ transitionTimingFunction: ease }}
            aria-label="Collapse panel"
          >
            <ChevronLeft size={14} strokeWidth={2} />
          </button>
        </div>

        {/* Search */}
        {(activeSection === "chat" || activeSection === "tasks") && (
          <div className="px-3 pb-2 flex-shrink-0">
            <div className="flex items-center gap-2 px-3 h-9 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:border-white/[0.14] transition-colors duration-[120ms]">
              <Search size={13} strokeWidth={2} className="text-white/35 flex-shrink-0" />
              <span className="text-[12.5px] text-white/30 font-sans select-none">
                {activeSection === "chat" ? "Search conversations…" : "Filter tasks…"}
              </span>
            </div>
          </div>
        )}

        {/* Sections */}
        <div className="flex-1 overflow-y-auto px-2.5 pb-4">
          {sections.map((section) => {
            return (
              <div key={section.title ?? "default"} className="mb-1">
                {section.title && (
                  <div className="px-2.5 pt-3 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/35">
                    {section.title}
                  </div>
                )}

                {(
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
                                    "flex items-center gap-2 w-full px-2.5 py-2 pr-7 rounded-lg text-[13px] font-sans cursor-pointer transition-colors duration-[120ms]",
                                    isActive ? "bg-white/[0.07] text-white" : "text-white/60 hover:text-white hover:bg-white/[0.045]",
                                  ].join(" ")}
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
                      section.items.map((item) => renderItem(item, 0))
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
