"use server";

import { redirect } from "next/navigation";
import { getRuntimeDatabase } from "@/db/runtime";
import {
  clearSessionCookie,
  readSessionToken,
} from "@/modules/auth/server-session";
import { logoutSession } from "@/modules/auth/service";

export async function logoutAction() {
  const token = await readSessionToken();

  if (token) {
    await logoutSession(getRuntimeDatabase(), token);
  }

  await clearSessionCookie();
  redirect("/login");
}
