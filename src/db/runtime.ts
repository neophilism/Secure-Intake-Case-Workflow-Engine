import { createDatabase } from "./client";
import { env } from "@/lib/env";

let runtime: ReturnType<typeof createDatabase> | null = null;

export function getRuntimeDatabase() {
  if (!env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is required for authentication and persisted application data.",
    );
  }

  runtime ??= createDatabase(env.DATABASE_URL);
  return runtime.db;
}
