import { z } from "zod";
import {
  deadlineDurationSchema,
  deadlineEscalationSchema,
} from "@/modules/workflows/definition";

const identifier = z
  .string()
  .min(1)
  .max(100)
  .regex(
    /^[a-z][a-z0-9_-]*$/,
    "Use lowercase identifiers with letters, numbers, underscores, or hyphens.",
  );

export const referralEventTypes = [
  "sent",
  "acknowledged",
  "preliminary_response",
  "status_update",
  "final_response",
  "completed",
  "cancelled",
] as const;

export type ReferralEventType = (typeof referralEventTypes)[number];

export const referralDeadlinePolicySchema = z.object({
  key: identifier,
  label: z.string().min(1).max(300),
  description: z.string().max(2000).optional(),
  trigger: z.enum(["sent", "acknowledged"]).default("sent"),
  duration: deadlineDurationSchema,
  warningBefore: deadlineDurationSchema.optional(),
  calendarKey: identifier.optional(),
  pausable: z.boolean().default(false),
  completeOnEvents: z
    .array(z.enum(referralEventTypes))
    .max(20)
    .default([]),
  escalation: deadlineEscalationSchema.optional(),
});

export type ReferralDeadlinePolicy = z.infer<
  typeof referralDeadlinePolicySchema
>;

export const referralPolicyDefinitionSchema = z
  .object({
    schemaVersion: z.literal(1),
    deadlinePolicies: z
      .array(referralDeadlinePolicySchema)
      .max(50)
      .default([]),
  })
  .superRefine((definition, ctx) => {
    const keys = new Set<string>();

    definition.deadlinePolicies.forEach((policy, index) => {
      if (keys.has(policy.key)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate referral deadline policy key: ${policy.key}`,
          path: ["deadlinePolicies", index, "key"],
        });
      }
      keys.add(policy.key);

      const usesBusinessDays =
        policy.duration.unit === "business_days" ||
        policy.warningBefore?.unit === "business_days";
      if (usesBusinessDays && !policy.calendarKey) {
        ctx.addIssue({
          code: "custom",
          message:
            "Business-day referral deadline policies require calendarKey.",
          path: ["deadlinePolicies", index, "calendarKey"],
        });
      }
    });
  });

export type ReferralPolicyDefinition = z.infer<
  typeof referralPolicyDefinitionSchema
>;

export function parseReferralPolicyDefinition(
  input: unknown,
): ReferralPolicyDefinition {
  return referralPolicyDefinitionSchema.parse(input);
}
