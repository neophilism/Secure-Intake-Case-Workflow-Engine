import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "secure-intake-case-workflow-engine",
    version: "0.1.0",
  });
}
