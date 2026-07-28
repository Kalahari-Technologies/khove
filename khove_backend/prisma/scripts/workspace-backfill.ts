/**
 * Workspace Backfill Migration
 *
 * For each existing user without a personal workspace:
 * 1. Creates a personal workspace with default statuses
 * 2. Assigns all workspaceId-null tasks to the personal workspace
 * 3. Assigns all workspaceId-null conversations to the personal workspace
 * 4. Assigns all workspaceId-null usage logs to the personal workspace
 *
 * Google Calendar integrations stay workspaceId: null (user-scoped by design).
 *
 * Run: npx tsx prisma/scripts/workspace-backfill.ts
 */

import { PrismaClient, type StatusCategory } from "@prisma/client";

const db = new PrismaClient();

const DEFAULT_STATUSES: {
  name: string;
  color: string;
  category: StatusCategory;
  position: number;
  isDefault: boolean;
}[] = [
  { name: "Todo", color: "#71717A", category: "NOT_STARTED", position: 0, isDefault: true },
  { name: "In Progress", color: "#6366F1", category: "IN_PROGRESS", position: 1, isDefault: false },
  { name: "In Review", color: "#F59E0B", category: "IN_REVIEW", position: 2, isDefault: false },
  { name: "Blocked", color: "#F43F5E", category: "BLOCKED", position: 3, isDefault: false },
  { name: "Done", color: "#10B981", category: "DONE", position: 4, isDefault: false },
  { name: "Cancelled", color: "#3F3F46", category: "CANCELLED", position: 5, isDefault: false },
];

function sanitizeSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

async function generateUniqueSlug(base: string): Promise<string> {
  let slug = sanitizeSlug(base);
  if (!slug) slug = "workspace";

  const reserved = ["login", "join", "onboarding", "api", "settings", "admin", "new", "invite", "_next", "assets"];
  if (reserved.includes(slug)) slug = `${slug}-1`;

  let candidate = slug;
  let counter = 1;
  while (await db.workspace.findUnique({ where: { slug: candidate } })) {
    candidate = `${slug}-${counter}`;
    counter++;
  }
  return candidate;
}

async function main() {
  // Find all users who don't have a personal workspace
  const usersWithoutWorkspace = await db.user.findMany({
    where: {
      ownedWorkspaces: {
        none: { isPersonal: true },
      },
    },
  });

  console.log(`Found ${usersWithoutWorkspace.length} users without a personal workspace`);

  let processed = 0;

  for (const user of usersWithoutWorkspace) {
    const baseName = user.name || user.email.split("@")[0];
    const slug = await generateUniqueSlug(baseName);

    await db.$transaction(async (tx) => {
      // 1. Create workspace
      const gradientOptions = ["sunset","aurora","ocean","ember","forest","berry","citrus","arctic","rose","mint","dawn","lavender","coral","sage","dusk"];
      const randomGradient = gradientOptions[Math.floor(Math.random() * gradientOptions.length)];

      const ws = await tx.workspace.create({
        data: {
          name: "My Space",
          slug,
          isPersonal: true,
          gradient: randomGradient,
          ownerId: user.id,
          planTier: user.planTier,
        },
      });

      // 2. Create OWNER membership
      await tx.workspaceMember.create({
        data: {
          workspaceId: ws.id,
          userId: user.id,
          role: "OWNER",
        },
      });

      // 3. Seed default workflow statuses
      await tx.workflowStatus.createMany({
        data: DEFAULT_STATUSES.map((s) => ({
          name: s.name,
          color: s.color,
          category: s.category,
          position: s.position,
          isDefault: s.isDefault,
          isSystem: false,
          workspaceId: ws.id,
        })),
      });

      // 4. Migrate orphaned tasks
      const taskResult = await tx.task.updateMany({
        where: { userId: user.id, workspaceId: null },
        data: { workspaceId: ws.id },
      });

      // 5. Migrate orphaned conversations
      const convResult = await tx.conversation.updateMany({
        where: { userId: user.id, workspaceId: null },
        data: { workspaceId: ws.id },
      });

      // 6. Migrate orphaned usage logs
      const usageResult = await tx.aiUsageLog.updateMany({
        where: { userId: user.id, workspaceId: null },
        data: { workspaceId: ws.id },
      });

      console.log(
        `  ✓ ${user.email} → /${slug} (${taskResult.count} tasks, ${convResult.count} conversations, ${usageResult.count} usage logs)`
      );
    });

    processed++;
  }

  console.log(`\nDone. Processed ${processed} users.`);
}

main()
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
