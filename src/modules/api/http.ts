import { NextResponse } from "next/server";
import { getRuntimeDatabase } from "@/db/runtime";
import type { Permission } from "@/modules/auth/permissions";
import {
  ApiAuthenticationError,
  apiClientHasPermission,
  authenticateApiToken,
  type ApiAuthorizationContext,
} from "./auth";

const noStoreHeaders = {
  "Cache-Control": "private, no-store",
  Pragma: "no-cache",
} as const;

function bearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() ?? null;
}

export function apiRateHeaders(context: ApiAuthorizationContext) {
  return {
    "X-RateLimit-Limit": String(context.rateLimit),
    "X-RateLimit-Remaining": String(context.rateRemaining),
    "X-RateLimit-Reset": String(
      Math.floor(context.rateResetAt.getTime() / 1000),
    ),
  };
}

export async function authorizeApiRequest(
  request: Request,
  required: readonly Permission[],
): Promise<
  | { ok: true; context: ApiAuthorizationContext }
  | { ok: false; response: NextResponse }
> {
  const token = bearerToken(request);
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: { code: "unauthorized", message: "Bearer token required." } },
        {
          status: 401,
          headers: {
            ...noStoreHeaders,
            "WWW-Authenticate": 'Bearer realm="sicwe-api"',
          },
        },
      ),
    };
  }

  let context: ApiAuthorizationContext;
  try {
    context = await authenticateApiToken(getRuntimeDatabase(), token);
  } catch (error) {
    const code =
      error instanceof ApiAuthenticationError
        ? error.code
        : "invalid_token";
    const status = code === "rate_limited" ? 429 : 401;
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            code,
            message:
              code === "rate_limited"
                ? "API rate limit exceeded."
                : "API credential is not valid.",
          },
        },
        {
          status,
          headers: {
            ...noStoreHeaders,
            ...(status === 429 ? { "Retry-After": "60" } : {}),
            ...(status === 401
              ? { "WWW-Authenticate": 'Bearer realm="sicwe-api"' }
              : {}),
          },
        },
      ),
    };
  }

  const missing = required.find(
    (permission) => !apiClientHasPermission(context, permission),
  );
  if (missing) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            code: "forbidden",
            message: "API credential lacks the required scope.",
          },
        },
        {
          status: 403,
          headers: {
            ...noStoreHeaders,
            ...apiRateHeaders(context),
          },
        },
      ),
    };
  }

  return { ok: true, context };
}

export function apiJson(
  context: ApiAuthorizationContext,
  body: unknown,
  init: ResponseInit = {},
) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...noStoreHeaders,
      ...apiRateHeaders(context),
      ...(init.headers ?? {}),
    },
  });
}

export function parsePage(request: Request) {
  const url = new URL(request.url);
  const rawLimit = Number(url.searchParams.get("limit") ?? "50");
  const rawOffset = Number(url.searchParams.get("offset") ?? "0");
  const limit =
    Number.isInteger(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, 100)
      : 50;
  const offset =
    Number.isInteger(rawOffset) && rawOffset >= 0
      ? Math.min(rawOffset, 10000)
      : 0;
  return { limit, offset };
}

export function paginated<T>(
  data: readonly T[],
  limit: number,
  offset: number,
) {
  return {
    data,
    pagination: {
      limit,
      offset,
      nextOffset: data.length === limit ? offset + limit : null,
    },
  };
}


export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
