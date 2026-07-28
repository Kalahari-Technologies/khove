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

  if (personalWorkspaceSlug) redirect(`/${personalWorkspaceSlug}/chat`);

  // Fallback — should not happen once ensurePersonalWorkspace has run.
  redirect("/onboarding");
}
