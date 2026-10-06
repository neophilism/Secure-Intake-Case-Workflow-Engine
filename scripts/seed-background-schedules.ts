import { createDatabase } from "../src/db/client";
import { env } from "../src/lib/env";
import { ensureBuiltinSchedules } from "../src/modules/jobs/service";

async function main() {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required.");
  }

  const { client, db } = createDatabase(env.DATABASE_URL);
  try {
    await ensureBuiltinSchedules(
      db,
      env.BACKGROUND_DEADLINE_SWEEP_SECONDS,
    );
    process.stdout.write("Background schedules synchronized.\n");
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : "Unknown schedule seed failure.";
  process.stderr.write(`Schedule seed failed: ${message}\n`);
  process.exitCode = 1;
});
