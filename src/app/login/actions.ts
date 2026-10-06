"use server";

import { redirect } from "next/navigation";
import { getRuntimeDatabase } from "@/db/runtime";
import {
  authenticateWithLocalPassword,
  type NewSession,
} from "@/modules/auth/service";
import { writeSessionCookie } from "@/modules/auth/server-session";

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  let session: NewSession;
  try {
    session = await authenticateWithLocalPassword(
      getRuntimeDatabase(),
      email,
      password,
    );
  } catch {
    redirect("/login?error=invalid_credentials");
  }

  await writeSessionCookie(session.token, session.expiresAt);

  redirect(
    session.activeOrganizationId
      ? "/admin/organizations"
      : "/select-organization",
  );
}
