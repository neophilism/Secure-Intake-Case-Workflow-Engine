import { createDatabase } from "../src/db/client";
import { bootstrapOrganizationAdministrator } from "../src/modules/auth/bootstrap";

const required = {
  DATABASE_URL: process.env.DATABASE_URL,
  BOOTSTRAP_ADMIN_EMAIL: process.env.BOOTSTRAP_ADMIN_EMAIL,
  BOOTSTRAP_ADMIN_PASSWORD: process.env.BOOTSTRAP_ADMIN_PASSWORD,
  BOOTSTRAP_ORGANIZATION_NAME: process.env.BOOTSTRAP_ORGANIZATION_NAME,
  BOOTSTRAP_ORGANIZATION_SLUG: process.env.BOOTSTRAP_ORGANIZATION_SLUG,
};

for (const [key, value] of Object.entries(required)) {
  if (!value) {
    throw new Error(`${key} is required.`);
  }
}

const { client, db } = createDatabase(required.DATABASE_URL!);

try {
  const result = await bootstrapOrganizationAdministrator(db, {
    email: required.BOOTSTRAP_ADMIN_EMAIL!,
    password: required.BOOTSTRAP_ADMIN_PASSWORD!,
    organizationName: required.BOOTSTRAP_ORGANIZATION_NAME!,
    organizationSlug: required.BOOTSTRAP_ORGANIZATION_SLUG!,
  });

  process.stdout.write(
    `Bootstrap complete for user ${result.userId} in organization ${result.organizationId}.\n`,
  );
} finally {
  await client.end();
}
