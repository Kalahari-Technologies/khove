import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";

export default async function HomePage() {
  const { userId: clerkId } = await auth();

  if (!clerkId) {
    redirect("/login");
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
