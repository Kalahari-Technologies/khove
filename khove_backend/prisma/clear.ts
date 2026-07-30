import { PrismaClient } from "@prisma/client";

/**
 * DEV-ONLY: wipe all application data from the database while keeping the schema
 * intact (TRUNCATE … RESTART IDENTITY CASCADE on every public table except the
 * Prisma migrations bookkeeping). Run with `npm run db:clear`.
 *
 * Guards against nuking a production database. This is destructive and
 * irreversible — there is no confirmation prompt, so only point it at a dev DB.
 */

const db = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run db:clear with NODE_ENV=production.");
  }

  const url = process.env.DATABASE_URL ?? "";
  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return "(unknown host)";
    }
  })();
  console.log(`⚠️  Clearing ALL data from database @ ${host}`);

  // Collect every base table in the public schema except Prisma's migration log.
  const rows = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;

  if (rows.length === 0) {
    console.log("No tables to clear.");
    return;
  }

  const list = rows.map((r) => `"public"."${r.tablename}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`);

  console.log(`✅ Cleared ${rows.length} tables: ${rows.map((r) => r.tablename).join(", ")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
