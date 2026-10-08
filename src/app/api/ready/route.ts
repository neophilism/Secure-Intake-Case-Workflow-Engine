import { NextResponse } from "next/server";
import { engineBuildInfo } from "@/lib/build-info";
import { checkDatabaseReadiness } from "@/lib/readiness";

export async function GET() {
  const database = await checkDatabaseReadiness();

  return NextResponse.json(
    {
      status: database.ready ? "ready" : "not_ready",
      ...engineBuildInfo,
      check: "readiness",
      checks: {
        database: database.status,
      },
    },
    {
      status: database.ready ? 200 : 503,
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}
