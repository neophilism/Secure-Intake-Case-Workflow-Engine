import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    name: "Secure Intake & Case Workflow Engine API",
    version: "v1",
    documentation: "/api/v1/openapi",
    authentication: "Bearer API key",
  });
}
