import { hasPermission, requireTenantScope } from "@/modules/auth/authorization";
import { getCurrentAuthorizationContext } from "@/modules/auth/server-session";
import { createApiClient } from "@/modules/api/auth";
import { getRuntimeDatabase } from "@/db/runtime";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return character;
    }
  });
}

export async function POST(request: Request) {
  const context = await getCurrentAuthorizationContext();
  if (!context) {
    return Response.redirect(new URL("/login", request.url), 303);
  }
  if (!context.tenantScope) {
    return Response.redirect(
      new URL("/select-organization", request.url),
      303,
    );
  }
  if (!hasPermission(context, "api:manage")) {
    return Response.redirect(new URL("/forbidden", request.url), 303);
  }

  const formData = await request.formData();
  const permissions = String(formData.get("permissions") ?? "")
    .split(",")
    .map((permission) => permission.trim())
    .filter(Boolean);
  const rawRate = Number(formData.get("rateLimitPerMinute") ?? 120);
  const expiresValue = String(formData.get("expiresAt") ?? "").trim();
  const expiresAt = expiresValue ? new Date(expiresValue) : null;

  try {
    const { client, token } = await createApiClient(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        name: String(formData.get("name") ?? ""),
        permissions,
        rateLimitPerMinute: rawRate,
        expiresAt:
          expiresAt && !Number.isNaN(expiresAt.getTime())
            ? expiresAt
            : null,
        actorUserId: context.user.id,
      },
    );

    const safeToken = escapeHtml(token);
    const safeName = escapeHtml(client.name);
    return new Response(
      `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="referrer" content="no-referrer">
<title>API key created</title>
</head>
<body>
<main>
<h1>API key created</h1>
<p><strong>${safeName}</strong></p>
<p>This credential is shown once. Copy it now and store it in a secrets manager.</p>
<pre id="token">${safeToken}</pre>
<p><a href="/admin/integrations">Return to integrations</a></p>
</main>
</body>
</html>`,
      {
        status: 201,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch {
    return Response.redirect(
      new URL("/admin/integrations?error=api_client_create_failed", request.url),
      303,
    );
  }
}
