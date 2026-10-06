"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getRuntimeDatabase } from "@/db/runtime";
import {
  authenticateWithLocalPassword,
  type NewSession,
} from "@/modules/auth/service";
import {
  LoginRateLimitError,
  trustedLoginSource,
} from "@/modules/auth/throttle";
import { writeSessionCookie } from "@/modules/auth/server-session";

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  let session: NewSession;
  try {
    const requestHeaders = await headers();
    session = await authenticateWithLocalPassword(
      getRuntimeDatabase(),
      email,
      password,
      trustedLoginSource(requestHeaders),
    );
  } catch (error) {
    if (error instanceof LoginRateLimitError) {
      redirect("/login?error=rate_limited");
    }
    redirect("/login?error=invalid_credentials");
  }

  await writeSessionCookie(session.token, session.expiresAt);

  redirect(
    session.activeOrganizationId
      ? "/admin/organizations"
      : "/select-organization",
  );
}
