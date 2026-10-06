import { env } from "@/lib/env";

export function trustedApplicationOrigin(): string {
  return new URL(env.APP_BASE_URL).origin;
}

export function isTrustedBrowserMutation(request: Request): boolean {
  const expected = trustedApplicationOrigin();
  const fetchSite = request.headers.get("sec-fetch-site");

  if (fetchSite === "cross-site") {
    return false;
  }

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).origin === expected;
    } catch {
      return false;
    }
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin === expected;
    } catch {
      return false;
    }
  }

  return false;
}

export function rejectUntrustedBrowserMutation(
  request: Request,
): Response | null {
  if (isTrustedBrowserMutation(request)) return null;

  return Response.json(
    { error: "invalid_request_origin" },
    {
      status: 403,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
