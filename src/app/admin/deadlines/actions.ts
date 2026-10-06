"use server";

import { redirect } from "next/navigation";
import { getRuntimeDatabase } from "@/db/runtime";
import {
  hasPermission,
  requireTenantScope,
} from "@/modules/auth/authorization";
import { getCurrentAuthorizationContext } from "@/modules/auth/server-session";
import {
  addDeadlineCalendarExclusion,
  createDeadlineCalendar,
  sweepOrganizationDeadlines,
} from "@/modules/deadlines/service";

async function requireDeadlineManager() {
  const context = await getCurrentAuthorizationContext();
  if (!context) redirect("/login");
  if (!context.tenantScope) redirect("/select-organization");
  if (!hasPermission(context, "deadline:manage")) {
    redirect("/forbidden");
  }
  return context;
}

export async function createDeadlineCalendarAction(
  formData: FormData,
) {
  const context = await requireDeadlineManager();

  const key = String(formData.get("key") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const timeZone = String(
    formData.get("timeZone") ?? "UTC",
  ).trim();
  const weekendDays = String(
    formData.get("weekendDays") ?? "0,6",
  )
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value));

  if (!key || !name || !timeZone) {
    redirect("/admin/deadlines?error=invalid_calendar");
  }

  try {
    await createDeadlineCalendar(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        key,
        name,
        timeZone,
        weekendDays,
        actorUserId: context.user.id,
      },
    );
  } catch {
    redirect("/admin/deadlines?error=create_calendar_failed");
  }

  redirect("/admin/deadlines");
}

export async function addDeadlineCalendarExclusionAction(
  formData: FormData,
) {
  const context = await requireDeadlineManager();

  const calendarId = String(
    formData.get("calendarId") ?? "",
  ).trim();
  const localDate = String(
    formData.get("localDate") ?? "",
  ).trim();
  const label = String(formData.get("label") ?? "").trim();

  if (!calendarId || !localDate) {
    redirect("/admin/deadlines?error=invalid_exclusion");
  }

  try {
    await addDeadlineCalendarExclusion(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        calendarId,
        localDate,
        label: label || null,
        actorUserId: context.user.id,
      },
    );
  } catch {
    redirect("/admin/deadlines?error=add_exclusion_failed");
  }

  redirect("/admin/deadlines");
}

export async function runDeadlineSweepAction() {
  const context = await requireDeadlineManager();

  try {
    const result = await sweepOrganizationDeadlines(
      getRuntimeDatabase(),
      requireTenantScope(context),
    );

    redirect(
      `/admin/deadlines?sweep=warnings:${result.warnings},overdue:${result.overdue},escalated:${result.escalated},failed:${result.escalationFailures}`,
    );
  } catch {
    redirect("/admin/deadlines?error=sweep_failed");
  }
}
