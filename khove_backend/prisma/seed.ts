import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const DEFAULT_STATUSES = [
  { name: "Todo", color: "#71717A", category: "NOT_STARTED", position: 0, isDefault: true, isSystem: true },
  { name: "In Progress", color: "#6366F1", category: "IN_PROGRESS", position: 1, isDefault: false, isSystem: true },
  { name: "In Review", color: "#F59E0B", category: "IN_REVIEW", position: 2, isDefault: false, isSystem: true },
  { name: "Blocked", color: "#F43F5E", category: "BLOCKED", position: 3, isDefault: false, isSystem: true },
  { name: "Done", color: "#10B981", category: "DONE", position: 4, isDefault: false, isSystem: true },
  { name: "Cancelled", color: "#3F3F46", category: "CANCELLED", position: 5, isDefault: false, isSystem: true },
] as const;

async function main() {
  console.log("Seeding default workflow statuses...");

  for (const status of DEFAULT_STATUSES) {
    await db.workflowStatus.upsert({
      where: {
        // Use a unique constraint on system statuses — workspaceId null + category
        // Since we don't have a unique constraint on that combo, we upsert by name+workspaceId
        id: `system-${status.category.toLowerCase()}`,
      },
      create: {
        id: `system-${status.category.toLowerCase()}`,
        name: status.name,
        color: status.color,
        category: status.category,
        position: status.position,
        isDefault: status.isDefault,
        isSystem: status.isSystem,
        workspaceId: null,
      },
      update: {
        name: status.name,
        color: status.color,
        position: status.position,
      },
    });
  }

  console.log(`✓ Seeded ${DEFAULT_STATUSES.length} system workflow statuses`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
