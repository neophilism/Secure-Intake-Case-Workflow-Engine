import { eq } from "drizzle-orm";
import { createDatabase } from "../src/db/client";
import { organizations } from "../src/db/schema";
import { createTrustedTenantScope } from "../src/lib/tenancy";
import { ensureDefaultRoles } from "../src/modules/auth/default-roles";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const { client, db } = createDatabase(databaseUrl);

  try {
    const activeOrganizations = await db
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .where(eq(organizations.status, "active"));

    for (const organization of activeOrganizations) {
      await ensureDefaultRoles(
        db,
        createTrustedTenantScope(organization.id),
      );
      process.stdout.write(
        `Synchronized default roles for ${organization.name}.\n`,
      );
    }
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Unknown role-sync failure.";
  process.stderr.write(`Role sync failed: ${message}\n`);
  process.exitCode = 1;
});
