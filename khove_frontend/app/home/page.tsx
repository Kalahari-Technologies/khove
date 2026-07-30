import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { serverTRPC } from "@/lib/trpc/server";

// The app entry point. Resolves the signed-in user's personal workspace and
// forwards to it. This is where "go to the app" leads (post-login, and when a
// signed-in user hits /login or /join). The marketing landing at `/` no longer
// does this.
export default async function HomeRedirect() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/login");

  // Clerk user without a username hasn't finished onboarding.
  const clerkUser = await currentUser();
  if (clerkUser && !clerkUser.username) redirect("/onboarding");

  let personalWorkspaceSlug: string | null = null;
  try {
    const trpc = await serverTRPC();
    const me = await trpc.workspace.me.query();
    personalWorkspaceSlug = me.personalWorkspaceSlug;
  } catch {
    redirect("/login");
  }

  // Fallback — should not happen once ensurePersonalWorkspace has run.
  if (!personalWorkspaceSlug) redirect("/onboarding");

  // Land on the user's default dashboard (the home), falling back to chat when
  // they have none yet. Guarded so any lookup failure still lands on chat.
  let target = `/${personalWorkspaceSlug}/chat`;
  try {
    const base = await serverTRPC();
    const ws = await base.workspace.getBySlug.query({ slug: personalWorkspaceSlug });
    const wsTrpc = await serverTRPC(ws.id);
    const list = await wsTrpc.dashboard.list.query();
    const def = list.find((d) => d.isDefault) ?? list[0];
    if (def) target = `/${personalWorkspaceSlug}/dashboards/${def.id}`;
  } catch {
    // fall back to chat
  }
  redirect(target);
}
