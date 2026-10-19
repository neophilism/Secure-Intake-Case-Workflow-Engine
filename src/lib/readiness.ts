import { createDatabase } from "@/db/client";

export type DatabaseReadiness =
  | { ready: true; status: "ok" }
  | {
      ready: false;
      status: "unconfigured" | "unavailable";
    };

export async function checkDatabaseReadiness(
  databaseUrl = process.env.DATABASE_URL,
  openDatabase = createDatabase,
): Promise<DatabaseReadiness> {
  if (!databaseUrl) {
    return {
      ready: false,
      status: "unconfigured",
    };
  }

  let client: ReturnType<typeof createDatabase>["client"] | undefined;
  try {
    client = openDatabase(databaseUrl).client;
    await client.unsafe("select 1");
    return {
      ready: true,
      status: "ok",
    };
  } catch {
    return {
      ready: false,
      status: "unavailable",
    };
  } finally {
    if (client) await client.end({ timeout: 1 }).catch(() => undefined);
  }
}
