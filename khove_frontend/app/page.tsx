import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Landing } from "@/components/landing/landing";
import { serverTRPC } from "@/lib/trpc/server";

export default async function HomePage() {
  const { userId: clerkId } = await auth();

  // Signed-out visitors see the marketing landing page.
  if (!clerkId) {
    return <Landing />;
  }

  // Clerk user without a username needs onboarding.
  const clerkUser = await currentUser();
  if (clerkUser && !clerkUser.username) {
    redirect("/onboarding");
  }

  // Resolve the personal workspace via the backend (no direct DB access).
  let personalWorkspaceSlug: string | null = null;
  try {
    const trpc = await serverTRPC();
    const me = await trpc.workspace.me.query();
    personalWorkspaceSlug = me.personalWorkspaceSlug;
  } catch {
    redirect("/login");
  }

  if (personalWorkspaceSlug) {
    redirect(`/${personalWorkspaceSlug}/chat`);
  }

  // Fallback — should not happen after ensurePersonalWorkspace in auth.
  redirect("/onboarding");
}
