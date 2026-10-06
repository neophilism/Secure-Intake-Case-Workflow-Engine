import { NextResponse } from "next/server";
import { getRuntimeDatabase } from "@/db/runtime";
import {
  requireTenantScope,
} from "@/modules/auth/authorization";
import { getCurrentAuthorizationContext } from "@/modules/auth/server-session";
import {
  canViewDocumentVisibility,
} from "@/modules/documents/policy";
import {
  findDocumentVersion,
} from "@/modules/documents/repository";
import {
  downloadDocumentVersion,
} from "@/modules/documents/service";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ versionId: string }>;
  },
) {
  const context = await getCurrentAuthorizationContext();
  if (!context) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!context.tenantScope) {
    return NextResponse.json(
      { error: "organization_required" },
      { status: 400 },
    );
  }

  const { versionId } = await params;
  const db = getRuntimeDatabase();
  const scope = requireTenantScope(context);
  const record = await findDocumentVersion(db, scope, versionId);

  if (!record) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (
    !canViewDocumentVisibility(
      record.document.visibility,
      context.permissions,
    )
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const { version, data } = await downloadDocumentVersion(
      db,
      scope,
      {
        versionId,
        actorUserId: context.user.id,
      },
    );

    const filename = version.originalFilename.replace(/["\r\n]/g, "_");

    return new Response(data, {
      status: 200,
      headers: {
        "Content-Type": version.mimeType,
        "Content-Length": String(version.sizeBytes),
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "content_unavailable" },
      { status: 409 },
    );
  }
}
