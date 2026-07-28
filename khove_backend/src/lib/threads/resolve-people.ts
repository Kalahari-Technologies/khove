import { db } from "@backend/lib/db";

export interface ResolvedPerson {
  email: string;
  userId: string | null; // set when the attendee is a member of the workspace
  name: string | null;
}

/**
 * Resolve calendar attendee emails to workspace members (the "people" dimension
 * of a thread). Emails that don't belong to a member are returned with
 * `userId: null` so they can still be linked as external people.
 */
export async function resolvePeople(
  workspaceId: string,
  emails: string[],
): Promise<ResolvedPerson[]> {
  const unique = [...new Set(emails.map((e) => e.toLowerCase().trim()).filter(Boolean))];
  if (unique.length === 0) return [];

  const members = await db.workspaceMember.findMany({
    where: { workspaceId, user: { email: { in: unique } } },
    include: { user: { select: { id: true, email: true, name: true } } },
  });

  const byEmail = new Map(members.map((m) => [m.user.email.toLowerCase(), m.user]));

  return unique.map((email) => {
    const user = byEmail.get(email);
    return { email, userId: user?.id ?? null, name: user?.name ?? null };
  });
}
