import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { authLoginThrottles } from "@/db/schema";
import { env } from "@/lib/env";

export class LoginRateLimitError extends Error {
  constructor() {
    super("Too many failed sign-in attempts. Try again later.");
    this.name = "LoginRateLimitError";
  }
}

export function normalizeLoginIdentifier(value: string) {
  return value.trim().toLowerCase();
}

export function loginBucketHash(
  kind: "account" | "source",
  value: string,
) {
  return createHash("sha256")
    .update(kind + ":" + value, "utf8")
    .digest("hex");
}

export function loginThrottleKeys(
  email: string,
  source?: string | null,
) {
  const account = loginBucketHash(
    "account",
    normalizeLoginIdentifier(email),
  );
  const sourceKey = source?.trim()
    ? loginBucketHash("source", source.trim())
    : null;

  return {
    account,
    all: sourceKey ? [account, sourceKey] : [account],
  };
}

export function trustedLoginSource(
  headers: Headers,
): string | null {
  if (!env.AUTH_TRUST_PROXY_HEADERS) return null;

  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp && isIP(realIp)) return realIp;

  const forwarded = headers.get("x-forwarded-for");
  if (!forwarded) return null;

  const candidate = forwarded.split(",")[0]?.trim() ?? "";
  return isIP(candidate) ? candidate : null;
}

export async function assertLoginAllowed(
  db: Database,
  keys: readonly string[],
  now = new Date(),
) {
  if (keys.length === 0) return;

  const blocked = await db
    .select({ keyHash: authLoginThrottles.keyHash })
    .from(authLoginThrottles)
    .where(
      and(
        inArray(authLoginThrottles.keyHash, [...keys]),
        gt(authLoginThrottles.blockedUntil, now),
      ),
    )
    .limit(1);

  if (blocked.length) {
    throw new LoginRateLimitError();
  }
}

export async function recordLoginFailure(
  db: Database,
  keys: readonly string[],
  now = new Date(),
) {
  const cutoff = new Date(
    now.getTime() - env.AUTH_LOGIN_WINDOW_MINUTES * 60_000,
  );
  const blockedUntil = new Date(
    now.getTime() + env.AUTH_LOGIN_BLOCK_MINUTES * 60_000,
  );

  for (const keyHash of keys) {
    await db.execute(sql`
      insert into auth_login_throttles (
        key_hash,
        window_started_at,
        failure_count,
        blocked_until,
        updated_at
      )
      values (
        ${keyHash},
        ${now},
        1,
        null,
        ${now}
      )
      on conflict (key_hash) do update set
        window_started_at = case
          when auth_login_throttles.window_started_at < ${cutoff}
            then ${now}
          else auth_login_throttles.window_started_at
        end,
        failure_count = case
          when auth_login_throttles.window_started_at < ${cutoff}
            then 1
          else auth_login_throttles.failure_count + 1
        end,
        blocked_until = case
          when auth_login_throttles.blocked_until > ${now}
            then auth_login_throttles.blocked_until
          when (
            case
              when auth_login_throttles.window_started_at < ${cutoff}
                then 1
              else auth_login_throttles.failure_count + 1
            end
          ) >= ${env.AUTH_LOGIN_FAILURE_LIMIT}
            then ${blockedUntil}
          else null
        end,
        updated_at = ${now}
    `);
  }
}

export async function clearAccountLoginFailures(
  db: Database,
  accountKey: string,
) {
  await db
    .delete(authLoginThrottles)
    .where(eq(authLoginThrottles.keyHash, accountKey));
}
