"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import {
  Bot,
  CheckSquare,
  CalendarDays,
  Layers,
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
  Users,
  MessageCircle,
} from "lucide-react";

// ─── Easing ───────────────────────────────────────────────────────────────────
const ease = "cubic-bezier(0.16, 1, 0.3, 1)";

// ─── Types ────────────────────────────────────────────────────────────────────

interface User {
  name: string | null;
  email: string;
  planTier: string;
}

interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
}

interface NavItem {
  id: string;
  href: string;
  icon: React.ElementType;
  label: string;
  locked: boolean;
  lockedLabel?: string;
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
  { id: "chat",     href: "/chat",     icon: MessageCircle,         label: "Chat",     locked: false },
  { id: "tasks",    href: "/tasks",    icon: CheckSquare, label: "Tasks",    locked: false },
  { id: "calendar", href: "/calendar", icon: CalendarDays,label: "Planner", locked: false },
  { id: "github",   href: "/github",   icon: Bot,      label: "GitHub",   locked: true, lockedLabel: "Phase 4" },
  { id: "jira",     href: "/jira",     icon: Layers,      label: "Jira",     locked: true, lockedLabel: "Phase 5" },
];

// ─── Detail Panel Content ─────────────────────────────────────────────────────

function getSections(section: string): { title: string; sections: DetailSection[] } {
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
            { label: "All tasks",      href: "/tasks",                        icon: List },
            { label: "In progress",    href: "/tasks?status=in_progress",     icon: Clock },
            { label: "Assigned to me", href: "/tasks?mine=true",              icon: Users },
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
    calendar: {
      title: "Planner",
      sections: [
        {
          title: "Views",
          items: [
            { label: "Month", icon: LayoutGrid },
            { label: "Week",  icon: CalendarDays },
            { label: "Day",   icon: List },
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
        { items: [{ label: "GitHub integration arrives in Phase 4.", sub: "placeholder" }] },
      ],
    },
    jira: {
      title: "Jira",
      sections: [
        { items: [{ label: "Jira integration arrives in Phase 5.", sub: "placeholder" }] },
      ],
    },
  };

  return map[section] ?? map.tasks;
}

// ─── Icon Rail ────────────────────────────────────────────────────────────────

function IconRail({ activeSection, panelCollapsed }: { activeSection: string; panelCollapsed: boolean }) {
  return (
    <aside className="relative flex flex-col items-center w-[52px] flex-shrink-0 bg-[#0a0a0a] border-r border-white/[0.07] py-3">
      {/* Subtle top-to-bottom gradient overlay for depth */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent" />

      {/* Logo mark */}
      <img src="/assets/khove-white.png" alt="Khove" className="w-8 h-8 mb-4 object-cover scale-150 select-none" draggable={false} />


      {/* Nav icons */}
      <nav className="flex flex-col gap-0.5 w-full px-1.5 flex-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <Link
              key={item.id}
              href={item.locked ? "#" : item.href}
              aria-label={item.label}
              title={item.locked ? `${item.label} — ${item.lockedLabel}` : item.label}
              tabIndex={item.locked ? -1 : 0}
              className={[
                "relative flex items-center justify-center w-full aspect-square rounded-lg transition-all duration-[120ms]",
                isActive
                  ? "bg-white/[0.10] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
                  : item.locked
                  ? "text-white/[0.22] cursor-default pointer-events-none"
                  : "text-white/60 hover:bg-white/[0.06] hover:text-white/90",
              ].join(" ")}
              style={{ transitionTimingFunction: ease }}
            >
              <Icon size={15} strokeWidth={isActive ? 2 : 1.75} />

              {/* Active left-edge accent */}
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full bg-white" />
              )}

              {/* Locked dot */}
              {item.locked && (
                <span className="absolute top-1 right-1 w-1 h-1 rounded-full bg-white/25" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom — settings (+ user only when panel is collapsed) */}
      <div className="flex flex-col gap-0.5 w-full px-1.5">
        <Link
          href="/settings"
          aria-label="Settings"
          title="Settings"
          className={[
            "flex items-center justify-center w-full aspect-square rounded-lg transition-all duration-[120ms]",
            activeSection === "settings"
              ? "bg-white/[0.10] text-white"
              : "text-white/60 hover:bg-white/[0.06] hover:text-white/90",
          ].join(" ")}
          style={{ transitionTimingFunction: ease }}
        >
          <Settings size={15} strokeWidth={1.75} />
        </Link>

        {panelCollapsed && (
          <div className="flex items-center justify-center w-full aspect-square rounded-lg">
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
  recentConversations,
}: {
  activeSection: string;
  user: User;
  isCollapsed: boolean;
  onToggle: () => void;
  recentConversations: Conversation[];
}) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["Quick Actions", "Views", "Suggested", "Recent"])
  );
  const { title, sections } = getSections(activeSection);

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
      {/* Subtle gradient for panel depth */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.015] to-transparent" />

      <div className="relative flex flex-col h-full w-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-14 flex-shrink-0 border-b border-white/[0.07]">
          <span className="font-display font-semibold text-white text-[15px] tracking-tight truncate">
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
                    {/* Recent conversations: special rendering for chat section */}
                    {section.title === "Recent" && activeSection === "chat" ? (
                      recentConversations.length === 0 ? (
                        <p className="px-2 py-2 text-[12px] text-white/30 font-sans leading-relaxed">
                          No conversations yet
                        </p>
                      ) : (
                        recentConversations.map((conv) => (
                          <Link key={conv.id} href={`/chat?conversationId=${conv.id}`}>
                            <span
                              className="flex items-center gap-2.5 w-full px-2 py-[7px] rounded-md text-[13px] font-sans text-white/65 hover:text-white hover:bg-white/[0.06] cursor-pointer transition-all duration-[120ms]"
                              style={{ transitionTimingFunction: ease }}
                            >
                              <span className="truncate flex-1 leading-snug">{conv.title}</span>
                            </span>
                          </Link>
                        ))
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
                            {item.href
                              ? <Link href={item.href}>{inner}</Link>
                              : <button type="button" className="w-full text-left">{inner}</button>
                            }
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
  recentConversations = [],
}: {
  user: User;
  recentConversations?: Conversation[];
}) {
  const pathname = usePathname();
  const [panelCollapsed, setPanelCollapsed] = useState(false);

  const activeSection =
    NAV_ITEMS.find((item) => pathname.startsWith(item.href))?.id ??
    (pathname.startsWith("/settings") ? "settings" : "chat");

  return (
    <div className="relative flex flex-row h-full flex-shrink-0">
      <IconRail activeSection={activeSection} panelCollapsed={panelCollapsed} />

      <DetailPanel
        activeSection={activeSection}
        user={user}
        isCollapsed={panelCollapsed}
        onToggle={() => setPanelCollapsed(true)}
        recentConversations={recentConversations}
      />

      {panelCollapsed && <ExpandToggle onClick={() => setPanelCollapsed(false)} />}
    </div>
  );
}
