import { createDatabase } from "@/db/client";

export type DatabaseReadiness =
  | { ready: true; status: "ok" }
  | {
      ready: false;
      status: "unconfigured" | "unavailable";
    };

export async function checkDatabaseReadiness(
  databaseUrl = process.env.DATABASE_URL,
): Promise<DatabaseReadiness> {
  if (!databaseUrl) {
    return {
      ready: false,
      status: "unconfigured",
    };
  }

  const { client } = createDatabase(databaseUrl);
  try {
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
    await client.end({ timeout: 1 }).catch(() => undefined);
  }
}
