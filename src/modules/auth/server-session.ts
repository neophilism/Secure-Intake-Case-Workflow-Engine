import { cookies } from "next/headers";
import { getRuntimeDatabase } from "@/db/runtime";
import { env } from "@/lib/env";
import { resolveAuthorizationContext } from "./service";

export async function readSessionToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(env.AUTH_SESSION_COOKIE_NAME)?.value ?? null;
}

export async function writeSessionCookie(
  token: string,
  expiresAt: Date,
): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.set(env.AUTH_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
    priority: "high",
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.set(env.AUTH_SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
    priority: "high",
  });
}

export async function getCurrentAuthorizationContext() {
  const token = await readSessionToken();
  if (!token) return null;

  return resolveAuthorizationContext(getRuntimeDatabase(), token);
}
