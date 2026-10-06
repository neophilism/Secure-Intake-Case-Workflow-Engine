import { getRuntimeDatabase } from "@/db/runtime";
import {
  hasPermission,
  requireTenantScope,
} from "@/modules/auth/authorization";
import { getCurrentAuthorizationContext } from "@/modules/auth/server-session";
import {
  consumeProtectedReveal,
  ProtectedRevealConflictError,
} from "@/modules/protected-data/service";
import { rejectUntrustedBrowserMutation } from "@/lib/request-security";

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body, null, 2) + "\n", {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, private, max-age=0",
      Pragma: "no-cache",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const originRejection = rejectUntrustedBrowserMutation(request);
  if (originRejection) return originRejection;

  const context = await getCurrentAuthorizationContext();
  if (!context || !context.tenantScope) {
    return jsonResponse(
      { error: { code: "authentication_required" } },
      401,
    );
  }
  if (
    !hasPermission(context, "protected_data:request_reveal")
  ) {
    return jsonResponse(
      { error: { code: "permission_denied" } },
      403,
    );
  }

  const { requestId } = await params;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      requestId,
    )
  ) {
    return jsonResponse(
      { error: { code: "invalid_request_id" } },
      400,
    );
  }

  try {
    const result = await consumeProtectedReveal(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        requestId,
        actorUserId: context.user.id,
      },
    );

    return jsonResponse(
      {
        data: {
          compartment: result.compartment.compartmentKey,
          fields: result.payload,
          revealedAt: new Date().toISOString(),
          oneTimeReveal: true,
        },
      },
      200,
    );
  } catch (error) {
    if (error instanceof ProtectedRevealConflictError) {
      return jsonResponse(
        {
          error: {
            code: "reveal_unavailable",
            message:
              "This reveal is unavailable, expired, already consumed, or belongs to another requester.",
          },
        },
        409,
      );
    }
    throw error;
  }
}
