import { z } from "zod";
import {
  corePermissions,
  defaultRoleTemplates,
} from "@/modules/auth/permissions";
import { formDefinitionSchema } from "@/modules/forms/definition";
import { routingRuleDefinitionSchema } from "@/modules/routing/definition";
import { workflowDefinitionSchema } from "@/modules/workflows/definition";

const identifier = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z][a-z0-9_-]*$/);

const labelPairSchema = z.object({
  singular: z.string().min(1).max(100),
  plural: z.string().min(1).max(100),
});

const brandingSchema = z.object({
  logoUrl: z.string().url().max(2000).optional(),
  accentColor: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .optional(),
  homeTitle: z.string().min(1).max(300).optional(),
  homeDescription: z.string().max(2000).optional(),
});

const terminologySchema = z
  .object({
    case: labelPairSchema.default({
      singular: "Case",
      plural: "Cases",
    }),
    submission: labelPairSchema.default({
      singular: "Submission",
      plural: "Submissions",
    }),
    submitter: labelPairSchema.default({
      singular: "Submitter",
      plural: "Submitters",
    }),
    review: labelPairSchema.default({
      singular: "Review",
      plural: "Reviews",
    }),
    deadline: labelPairSchema.default({
      singular: "Deadline",
      plural: "Deadlines",
    }),
    document: labelPairSchema.default({
      singular: "Document",
      plural: "Documents",
    }),
    queue: labelPairSchema.default({
      singular: "Queue",
      plural: "Queues",
    }),
  })
  .default({});

const roleSchema = z.object({
  key: identifier,
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  permissions: z.array(z.enum(corePermissions)).max(200),
});

const documentTypeSchema = z.object({
  key: identifier,
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  acceptedMimeTypes: z.array(z.string().min(1).max(200)).max(100).default([]),
  maxBytes: z.number().int().positive().max(2_147_483_647).optional(),
});

const deadlineCalendarSchema = z.object({
  key: identifier,
  name: z.string().min(1).max(200),
  timeZone: z.string().min(1).max(100).default("UTC"),
  weekendDays: z
    .array(z.number().int().min(0).max(6))
    .min(1)
    .max(7)
    .default([0, 6]),
});

const queueSchema = z.object({
  slug: identifier,
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  assignmentStrategy: z.enum(["manual", "round_robin"]).default("manual"),
});

const communicationTemplateSchema = z.object({
  key: identifier,
  name: z.string().min(1).max(200),
  channel: z.enum(["email", "letter", "portal", "manual"]).default("email"),
  subjectTemplate: z.string().max(5000).optional(),
  bodyTemplate: z.string().min(1).max(100_000),
  defaultVisibility: z
    .enum(["public", "participant", "internal", "restricted"])
    .default("participant"),
});

const workflowSchema = z.object({
  slug: identifier,
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  definition: workflowDefinitionSchema,
});

const formSchema = z.object({
  slug: identifier,
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  accessMode: z.enum(["public", "authenticated"]).default("public"),
  definition: formDefinitionSchema,
  workflowSlug: identifier.optional(),
});

const routingRuleSchema = z.object({
  key: identifier,
  name: z.string().min(1).max(200),
  priority: z.number().int().min(0).max(10000).default(100),
  definition: routingRuleDefinitionSchema,
  targetQueueSlug: identifier,
});

const reviewPolicySchema = z.object({
  key: identifier,
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  level: z.number().int().min(1).max(100).default(1),
  eligibleCaseStatuses: z.array(identifier).max(200).default([]),
  filingWindow: z
    .object({
      value: z.number().int().positive().max(36500),
      unit: z.enum(["hours", "calendar_days", "business_days"]),
    })
    .optional(),
  decisionDeadline: z
    .object({
      value: z.number().int().positive().max(36500),
      unit: z.enum(["hours", "calendar_days", "business_days"]),
    })
    .optional(),
  decisionWarningBefore: z
    .object({
      value: z.number().int().positive().max(36500),
      unit: z.enum(["hours", "calendar_days", "business_days"]),
    })
    .optional(),
  calendarKey: identifier.optional(),
  allowedOutcomes: z.array(identifier).min(1).max(50).default([
    "affirmed",
    "modified",
    "reversed",
    "remanded",
    "dismissed",
  ]),
  requireIndependentReviewer: z.boolean().default(true),
  prerequisitePolicyKeys: z.array(identifier).max(50).default([]),
});

export const applicationManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    application: z.object({
      key: identifier,
      name: z.string().min(1).max(200),
      shortName: z.string().min(1).max(100).optional(),
      description: z.string().max(4000).optional(),
      branding: brandingSchema.default({}),
      terminology: terminologySchema,
    }),
    roles: z.array(roleSchema).max(100).default([]),
    documentTypes: z.array(documentTypeSchema).max(200).default([]),
    deadlineCalendars: z.array(deadlineCalendarSchema).max(50).default([]),
    queues: z.array(queueSchema).max(100).default([]),
    communicationTemplates: z
      .array(communicationTemplateSchema)
      .max(200)
      .default([]),
    workflows: z.array(workflowSchema).max(100).default([]),
    forms: z.array(formSchema).max(100).default([]),
    routingRules: z.array(routingRuleSchema).max(500).default([]),
    reviewPolicies: z.array(reviewPolicySchema).max(100).default([]),
  })
  .superRefine((manifest, ctx) => {
    const systemRoleKeys = new Set(
      defaultRoleTemplates.map((role) => role.key),
    );

    function unique(
      values: readonly string[],
      path: string,
    ) {
      const seen = new Set<string>();
      values.forEach((value, index) => {
        if (seen.has(value)) {
          ctx.addIssue({
            code: "custom",
            message: `Duplicate ${path} key: ${value}`,
            path: [path, index],
          });
        }
        seen.add(value);
      });
      return seen;
    }

    const roleKeys = unique(
      manifest.roles.map((role) => role.key),
      "roles",
    );
    for (const key of roleKeys) {
      if (systemRoleKeys.has(key)) {
        ctx.addIssue({
          code: "custom",
          message:
            `Manifest role '${key}' collides with a core system role.`,
          path: ["roles"],
        });
      }
    }

    unique(
      manifest.documentTypes.map((item) => item.key),
      "documentTypes",
    );
    const calendarKeys = unique(
      manifest.deadlineCalendars.map((item) => item.key),
      "deadlineCalendars",
    );
    const queueKeys = unique(
      manifest.queues.map((item) => item.slug),
      "queues",
    );
    unique(
      manifest.communicationTemplates.map((item) => item.key),
      "communicationTemplates",
    );
    const workflowKeys = unique(
      manifest.workflows.map((item) => item.slug),
      "workflows",
    );
    unique(
      manifest.forms.map((item) => item.slug),
      "forms",
    );
    unique(
      manifest.routingRules.map((item) => item.key),
      "routingRules",
    );
    const reviewKeys = unique(
      manifest.reviewPolicies.map((item) => item.key),
      "reviewPolicies",
    );

    manifest.forms.forEach((form, index) => {
      if (form.workflowSlug && !workflowKeys.has(form.workflowSlug)) {
        ctx.addIssue({
          code: "custom",
          message:
            `Form references undeclared workflow: ${form.workflowSlug}`,
          path: ["forms", index, "workflowSlug"],
        });
      }
    });

    manifest.routingRules.forEach((rule, index) => {
      if (!queueKeys.has(rule.targetQueueSlug)) {
        ctx.addIssue({
          code: "custom",
          message:
            `Routing rule references undeclared queue: ${rule.targetQueueSlug}`,
          path: ["routingRules", index, "targetQueueSlug"],
        });
      }
    });

    manifest.reviewPolicies.forEach((policy, index) => {
      const usesBusinessDays =
        policy.filingWindow?.unit === "business_days" ||
        policy.decisionDeadline?.unit === "business_days" ||
        policy.decisionWarningBefore?.unit === "business_days";
      if (usesBusinessDays && !policy.calendarKey) {
        ctx.addIssue({
          code: "custom",
          message:
            "Business-day review timing requires calendarKey.",
          path: ["reviewPolicies", index, "calendarKey"],
        });
      }
      if (
        policy.calendarKey &&
        !calendarKeys.has(policy.calendarKey)
      ) {
        ctx.addIssue({
          code: "custom",
          message:
            `Review policy references undeclared calendar: ${policy.calendarKey}`,
          path: ["reviewPolicies", index, "calendarKey"],
        });
      }
      for (const prerequisite of policy.prerequisitePolicyKeys) {
        if (!reviewKeys.has(prerequisite)) {
          ctx.addIssue({
            code: "custom",
            message:
              `Review policy references undeclared prerequisite: ${prerequisite}`,
            path: [
              "reviewPolicies",
              index,
              "prerequisitePolicyKeys",
            ],
          });
        }
      }
    });
  });

export type ApplicationManifest = z.infer<
  typeof applicationManifestSchema
>;

export type ApplicationTerminology =
  ApplicationManifest["application"]["terminology"];

export function parseApplicationManifest(
  value: unknown,
): ApplicationManifest {
  return applicationManifestSchema.parse(value);
}
