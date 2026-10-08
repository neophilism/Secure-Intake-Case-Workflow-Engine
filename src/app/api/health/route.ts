import { NextResponse } from "next/server";
import { engineBuildInfo } from "@/lib/build-info";

export function GET() {
  return NextResponse.json(
    {
      status: "ok",
      ...engineBuildInfo,
      check: "liveness",
    },
    {
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}
