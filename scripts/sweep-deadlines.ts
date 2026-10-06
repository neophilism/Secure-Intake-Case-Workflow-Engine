import { eq } from "drizzle-orm";
import { createDatabase } from "../src/db/client";
import { organizations } from "../src/db/schema";
import { createTrustedTenantScope } from "../src/lib/tenancy";
import { sweepOrganizationDeadlines } from "../src/modules/deadlines/service";

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
      const result = await sweepOrganizationDeadlines(
        db,
        createTrustedTenantScope(organization.id),
      );

      process.stdout.write(
        [
          organization.name,
          `warnings=${result.warnings}`,
          `overdue=${result.overdue}`,
          `escalated=${result.escalated}`,
          `escalation_failures=${result.escalationFailures}`,
        ].join(" ") + "\n",
      );
    }
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : "Unknown deadline sweep failure.";
  process.stderr.write(`Deadline sweep failed: ${message}\n`);
  process.exitCode = 1;
});
