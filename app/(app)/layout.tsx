import { UserButton } from "@clerk/nextjs";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

const NAV_ITEMS = [
  { href: "/chat", label: "Chat", icon: "💬" },
  { href: "/tasks", label: "Tasks", icon: "✓" },
  { href: "/calendar", label: "Calendar", icon: "📅", phase: 3 },
  { href: "/github", label: "GitHub", icon: "⬡", phase: 4 },
  { href: "/jira", label: "Jira", icon: "◆", phase: 5 },
] as const;

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/sign-in");
  }

  return (
    <div className="flex h-screen bg-bg-base overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 flex flex-col border-r border-border bg-bg-surface">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 h-14 border-b border-border">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-brand-primary to-brand-secondary flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-xs">K</span>
          </div>
          <span className="text-text-primary font-semibold text-sm tracking-tight">Khove</span>
          {/* Plan badge */}
          <span className="ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded bg-bg-overlay text-text-secondary uppercase tracking-wider">
            {user.planTier}
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-all duration-fast ease-khove group"
            >
              <span className="text-base w-5 text-center opacity-60 group-hover:opacity-100 transition-opacity">
                {item.icon}
              </span>
              <span>{item.label}</span>
              {"phase" in item && (
                <span className="ml-auto text-[10px] text-text-disabled">
                  Soon
                </span>
              )}
            </Link>
          ))}
        </nav>

        {/* Footer — user + usage */}
        <div className="px-3 py-3 border-t border-border">
          <div className="flex items-center gap-2.5">
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "w-7 h-7",
                },
              }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-text-primary truncate">
                {user.name ?? user.email.split("@")[0]}
              </p>
              <p className="text-[10px] text-text-tertiary truncate">{user.email}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
