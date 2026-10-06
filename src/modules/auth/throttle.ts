import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { and, eq, gt, inArray, lt, sql } from "drizzle-orm";
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
  kind: "account" | "source" | "participant",
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

  const staleBefore = new Date(
    now.getTime() -
      (env.AUTH_LOGIN_WINDOW_MINUTES +
        env.AUTH_LOGIN_BLOCK_MINUTES) *
        60_000 *
        2,
  );

  await db
    .delete(authLoginThrottles)
    .where(lt(authLoginThrottles.updatedAt, staleBefore));

  for (const keyHash of keys) {
    await db
      .insert(authLoginThrottles)
      .values({
        keyHash,
        windowStartedAt: now,
        failureCount: 1,
        blockedUntil: null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: authLoginThrottles.keyHash,
        set: {
          windowStartedAt: sql`
            case
              when ${authLoginThrottles.windowStartedAt} < ${cutoff}::timestamptz
                then ${now}::timestamptz
              else ${authLoginThrottles.windowStartedAt}
            end
          `,
          failureCount: sql`
            case
              when ${authLoginThrottles.windowStartedAt} < ${cutoff}::timestamptz
                then 1
              else ${authLoginThrottles.failureCount} + 1
            end
          `,
          blockedUntil: sql`
            case
              when ${authLoginThrottles.blockedUntil} > ${now}::timestamptz
                then ${authLoginThrottles.blockedUntil}
              when (
                case
                  when ${authLoginThrottles.windowStartedAt} < ${cutoff}::timestamptz
                    then 1
                  else ${authLoginThrottles.failureCount} + 1
                end
              ) >= ${env.AUTH_LOGIN_FAILURE_LIMIT}
                then ${blockedUntil}::timestamptz
              else null
            end
          `,
          updatedAt: now,
        },
      });
  }
}

export async function clearLoginFailuresForKey(
  db: Database,
  keyHash: string,
) {
  await db
    .delete(authLoginThrottles)
    .where(eq(authLoginThrottles.keyHash, keyHash));
}

export async function clearAccountLoginFailures(
  db: Database,
  accountKey: string,
) {
  return clearLoginFailuresForKey(db, accountKey);
}
