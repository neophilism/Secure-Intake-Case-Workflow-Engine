import { z } from "zod";

const identifier = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z][a-z0-9_-]*$/);

export const reviewDurationUnitSchema = z.enum([
  "hours",
  "calendar_days",
  "business_days",
]);

export type ReviewDurationUnit = z.infer<
  typeof reviewDurationUnitSchema
>;

export const reviewOutcomeSchema = identifier;
export type ReviewOutcome = z.infer<typeof reviewOutcomeSchema>;

export const reviewPolicyInputSchema = z
  .object({
    key: identifier,
    name: z.string().min(1).max(300),
    description: z.string().max(3000).nullable().optional(),
    level: z.number().int().positive().max(100),
    eligibleCaseStatuses: z.array(identifier).max(200).default([]),
    filingWindow: z
      .object({
        value: z.number().int().positive().max(36500),
        unit: reviewDurationUnitSchema,
      })
      .nullable()
      .optional(),
    decisionDeadline: z
      .object({
        value: z.number().int().positive().max(36500),
        unit: reviewDurationUnitSchema,
        warningBefore: z
          .object({
            value: z.number().int().positive().max(36500),
            unit: reviewDurationUnitSchema,
          })
          .nullable()
          .optional(),
      })
      .nullable()
      .optional(),
    calendarId: z.string().uuid().nullable().optional(),
    allowedOutcomes: z
      .array(reviewOutcomeSchema)
      .min(1)
      .max(100),
    requireIndependentReviewer: z.boolean().default(true),
    prerequisitePolicyIds: z.array(z.string().uuid()).max(100).default([]),
  })
  .superRefine((value, ctx) => {
    const needsCalendar =
      value.filingWindow?.unit === "business_days" ||
      value.decisionDeadline?.unit === "business_days" ||
      value.decisionDeadline?.warningBefore?.unit === "business_days";

    if (needsCalendar && !value.calendarId) {
      ctx.addIssue({
        code: "custom",
        message: "Business-day review timing requires a calendar.",
        path: ["calendarId"],
      });
    }

    if (
      new Set(value.allowedOutcomes).size !==
      value.allowedOutcomes.length
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Review outcomes must be unique.",
        path: ["allowedOutcomes"],
      });
    }

    if (
      new Set(value.eligibleCaseStatuses).size !==
      value.eligibleCaseStatuses.length
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Eligible case statuses must be unique.",
        path: ["eligibleCaseStatuses"],
      });
    }

    if (
      new Set(value.prerequisitePolicyIds).size !==
      value.prerequisitePolicyIds.length
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Prerequisite review policies must be unique.",
        path: ["prerequisitePolicyIds"],
      });
    }
  });

export type ReviewPolicyInput = z.infer<
  typeof reviewPolicyInputSchema
>;

export interface ReviewPolicySnapshot {
  schemaVersion: 1;
  key: string;
  name: string;
  description: string | null;
  level: number;
  eligibleCaseStatuses: string[];
  filingWindow: {
    value: number;
    unit: ReviewDurationUnit;
  } | null;
  decisionDeadline: {
    value: number;
    unit: ReviewDurationUnit;
    warningBefore: {
      value: number;
      unit: ReviewDurationUnit;
    } | null;
  } | null;
  calendarId: string | null;
  allowedOutcomes: string[];
  requireIndependentReviewer: boolean;
  prerequisitePolicies: Array<{
    id: string;
    key: string;
    name: string;
    level: number;
  }>;
}

export function parseReviewPolicyInput(
  input: unknown,
): ReviewPolicyInput {
  return reviewPolicyInputSchema.parse(input);
}

export function parseReviewPolicySnapshot(
  input: unknown,
): ReviewPolicySnapshot {
  return z
    .object({
      schemaVersion: z.literal(1),
      key: identifier,
      name: z.string().min(1),
      description: z.string().nullable(),
      level: z.number().int().positive(),
      eligibleCaseStatuses: z.array(identifier),
      filingWindow: z
        .object({
          value: z.number().int().positive(),
          unit: reviewDurationUnitSchema,
        })
        .nullable(),
      decisionDeadline: z
        .object({
          value: z.number().int().positive(),
          unit: reviewDurationUnitSchema,
          warningBefore: z
            .object({
              value: z.number().int().positive(),
              unit: reviewDurationUnitSchema,
            })
            .nullable(),
        })
        .nullable(),
      calendarId: z.string().uuid().nullable(),
      allowedOutcomes: z.array(reviewOutcomeSchema).min(1),
      requireIndependentReviewer: z.boolean(),
      prerequisitePolicies: z.array(
        z.object({
          id: z.string().uuid(),
          key: identifier,
          name: z.string().min(1),
          level: z.number().int().positive(),
        }),
      ),
    })
    .parse(input);
}
