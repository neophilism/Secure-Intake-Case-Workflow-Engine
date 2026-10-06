"use server";

import { redirect } from "next/navigation";
import { getRuntimeDatabase } from "@/db/runtime";
import {
  hasPermission,
  requireTenantScope,
} from "@/modules/auth/authorization";
import { getCurrentAuthorizationContext } from "@/modules/auth/server-session";
import {
  createReviewPolicy,
  setReviewPolicyStatus,
} from "@/modules/reviews/service";
import {
  reviewDurationUnitSchema,
} from "@/modules/reviews/policy";

async function requireReviewManager() {
  const context = await getCurrentAuthorizationContext();
  if (!context) redirect("/login");
  if (!context.tenantScope) redirect("/select-organization");
  if (!hasPermission(context, "review:manage")) {
    redirect("/forbidden");
  }
  return context;
}

function optionalPositiveInt(
  value: FormDataEntryValue | null,
): number | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Number(text);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("Expected a positive integer.");
  }
  return parsed;
}

function csvIdentifiers(value: FormDataEntryValue | null) {
  return [
    ...new Set(
      String(value ?? "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ];
}

export async function createReviewPolicyAction(
  formData: FormData,
) {
  const context = await requireReviewManager();

  try {
    const filingWindowValue = optionalPositiveInt(
      formData.get("filingWindowValue"),
    );
    const decisionDeadlineValue = optionalPositiveInt(
      formData.get("decisionDeadlineValue"),
    );
    const warningValue = optionalPositiveInt(
      formData.get("decisionWarningBeforeValue"),
    );

    await createReviewPolicy(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        key: String(formData.get("key") ?? "").trim(),
        name: String(formData.get("name") ?? "").trim(),
        description:
          String(formData.get("description") ?? "").trim() ||
          null,
        level: Number(formData.get("level") ?? 1),
        eligibleCaseStatuses: csvIdentifiers(
          formData.get("eligibleCaseStatuses"),
        ),
        filingWindow: filingWindowValue
          ? {
              value: filingWindowValue,
              unit: reviewDurationUnitSchema.parse(
                String(
                  formData.get("filingWindowUnit") ??
                    "calendar_days",
                ),
              ),
            }
          : null,
        decisionDeadline: decisionDeadlineValue
          ? {
              value: decisionDeadlineValue,
              unit: reviewDurationUnitSchema.parse(
                String(
                  formData.get("decisionDeadlineUnit") ??
                    "calendar_days",
                ),
              ),
              warningBefore: warningValue
                ? {
                    value: warningValue,
                    unit: reviewDurationUnitSchema.parse(
                      String(
                        formData.get(
                          "decisionWarningBeforeUnit",
                        ) ?? "calendar_days",
                      ),
                    ),
                  }
                : null,
            }
          : null,
        calendarId:
          String(formData.get("calendarId") ?? "").trim() ||
          null,
        allowedOutcomes: csvIdentifiers(
          formData.get("allowedOutcomes"),
        ),
        requireIndependentReviewer:
          String(
            formData.get("requireIndependentReviewer") ??
              "true",
          ) === "true",
        prerequisitePolicyIds: formData
          .getAll("prerequisitePolicyIds")
          .map((value) => String(value).trim())
          .filter(Boolean),
        actorUserId: context.user.id,
      },
    );
  } catch {
    redirect("/admin/reviews?error=policy_create_failed");
  }

  redirect("/admin/reviews");
}

export async function setReviewPolicyStatusAction(
  policyId: string,
  status: "active" | "inactive",
  _formData: FormData,
) {
  const context = await requireReviewManager();

  try {
    await setReviewPolicyStatus(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        policyId,
        status,
        actorUserId: context.user.id,
      },
    );
  } catch {
    redirect("/admin/reviews?error=policy_status_failed");
  }

  redirect("/admin/reviews");
}
