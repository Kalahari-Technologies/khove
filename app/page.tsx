import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { Landing } from "@/components/landing/landing";

export default async function HomePage() {
  const { userId: clerkId } = await auth();

  // Signed-out visitors see the marketing landing page. Signed-in users fall
  // through to the workspace redirect below.
  if (!clerkId) {
    return <Landing />;
  }

  // Check if Clerk user has a username set — if not, they need onboarding
  const clerkUser = await currentUser();
  if (clerkUser && !clerkUser.username) {
    redirect("/onboarding");
  }

  // Look up user's personal workspace slug
  const user = await db.user.findUnique({ where: { clerkId } });
  if (!user) redirect("/login");

  const personalWorkspace = await db.workspace.findFirst({
    where: { ownerId: user.id, isPersonal: true },
    select: { slug: true },
  });

  if (personalWorkspace) {
    redirect(`/${personalWorkspace.slug}/chat`);
  }

  // Fallback — should not happen after ensurePersonalWorkspace in auth
  redirect("/onboarding");
}
