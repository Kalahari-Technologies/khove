import { PrismaClient } from "@prisma/client";

// One-off: clear dead Google Calendar integrations so the refresh cron stops
// throwing invalid_grant. Run: dotenv -e .env.local -- tsx prisma/clear-google-integration.ts
const db = new PrismaClient();

async function main() {
  const rows = await db.integration.findMany({
    where: { provider: "GOOGLE_CALENDAR" },
    select: { id: true, workspaceId: true, userId: true, isActive: true, tokenExpiresAt: true, createdAt: true },
  });
  console.log(`Found ${rows.length} GOOGLE_CALENDAR integration(s):`);
  for (const r of rows) console.log("  ", JSON.stringify(r));

  const del = await db.integration.deleteMany({ where: { provider: "GOOGLE_CALENDAR" } });
  console.log(`Deleted ${del.count} GOOGLE_CALENDAR integration row(s). Refresh cron will now find nothing.`);
}

main()
  .catch((e) => {
    console.error("Clear failed:", e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
