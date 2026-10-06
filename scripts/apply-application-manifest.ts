import { readFile } from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import { createDatabase } from "../src/db/client";
import { organizations } from "../src/db/schema";
import { env } from "../src/lib/env";
import { createTrustedTenantScope } from "../src/lib/tenancy";
import { applyApplicationManifest } from "../src/modules/application/service";
import { parseApplicationManifest } from "../src/modules/application/manifest";
import {
  findActiveMembership,
  findActiveUserByEmail,
  listMembershipAuthorization,
} from "../src/modules/auth/repository";

function valueAfter(flag: string) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const file = valueAfter("--file");
  if (!file) {
    throw new Error("--file <manifest.json> is required.");
  }

  const raw = await readFile(file, "utf8");
  const manifest = parseApplicationManifest(JSON.parse(raw));

  if (process.argv.includes("--validate-only")) {
    process.stdout.write(
      `Valid application manifest: ${manifest.application.key}\n`,
    );
    return;
  }

  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to apply a manifest.");
  }

  const organizationSlug = valueAfter("--organization");
  const actorEmail = valueAfter("--actor-email");
  if (!organizationSlug || !actorEmail) {
    throw new Error(
      "--organization <slug> and --actor-email <email> are required.",
    );
  }

  const { client, db } = createDatabase(env.DATABASE_URL);
  try {
    const [[organization], actor] = await Promise.all([
      db
        .select({ id: organizations.id })
        .from(organizations)
        .where(
          and(
            eq(organizations.slug, organizationSlug),
            eq(organizations.status, "active"),
          ),
        )
        .limit(1),
      findActiveUserByEmail(db, actorEmail),
    ]);

    if (!organization || !actor) {
      throw new Error("Organization or actor was not found.");
    }

    const scope = createTrustedTenantScope(organization.id);
    const membership = await findActiveMembership(
      db,
      actor.id,
      organization.id,
    );
    if (!membership) {
      throw new Error("Actor is not an active organization member.");
    }

    const authorization = await listMembershipAuthorization(
      db,
      scope,
      membership.id,
    );
    const permissions = new Set(
      authorization
        .map((row) => row.permission)
        .filter((value): value is string => Boolean(value)),
    );
    if (!permissions.has("application:manage")) {
      throw new Error("Actor lacks application:manage.");
    }

    const result = await applyApplicationManifest(
      db,
      scope,
      manifest,
      actor.id,
    );

    process.stdout.write(
      JSON.stringify(
        {
          application: manifest.application.key,
          noChange: result.noChange,
          revisionId: result.revisionId,
          manifestHash: result.manifestHash,
          counts: result.counts,
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Unknown manifest error.";
  process.stderr.write(`Application manifest failed: ${message}\n`);
  process.exitCode = 1;
});
