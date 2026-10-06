import { cookies } from "next/headers";
import { env } from "@/lib/env";

export async function readExternalParticipantSessionToken() {
  const store = await cookies();
  return (
    store.get(env.PARTICIPANT_SESSION_COOKIE_NAME)?.value ??
    null
  );
}

export async function writeExternalParticipantSessionCookie(
  token: string,
  expiresAt: Date,
) {
  const store = await cookies();
  store.set(env.PARTICIPANT_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/participant",
    expires: expiresAt,
    priority: "high",
  });
}

export async function clearExternalParticipantSessionCookie() {
  const store = await cookies();
  store.set(env.PARTICIPANT_SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/participant",
    expires: new Date(0),
    priority: "high",
  });
}
