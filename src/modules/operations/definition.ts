import { z } from "zod";

export const operationalFocuses = [
  "all",
  "open",
  "mine",
  "unassigned",
  "overdue",
  "escalated",
  "open_review",
  "recently_closed",
] as const;

export const caseSearchSorts = [
  "updated_desc",
  "created_desc",
  "priority_desc",
] as const;

const compactString = z.string().trim().min(1).max(120);
const idString = z.string().uuid();

export const caseSearchDefinitionSchema = z.object({
  q: z.string().trim().max(200).optional(),
  statuses: z.array(compactString).max(20).default([]),
  priorities: z.array(compactString).max(20).default([]),
  queueIds: z.array(idString).max(20).default([]),
  assigneeMembershipIds: z.array(idString).max(20).default([]),
  tags: z.array(compactString).max(20).default([]),
  focus: z.enum(operationalFocuses).default("all"),
  sort: z.enum(caseSearchSorts).default("updated_desc"),
  limit: z.number().int().min(1).max(200).default(50),
});

export type CaseSearchDefinition = z.infer<
  typeof caseSearchDefinitionSchema
>;

function compact(values: readonly string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function split(value: string | string[] | undefined) {
  if (!value) return [];
  const values = Array.isArray(value) ? value : [value];
  return compact(values.flatMap((item) => item.split(",")));
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseCaseSearchDefinition(
  value: unknown,
): CaseSearchDefinition {
  const parsed = caseSearchDefinitionSchema.parse(value);
  return {
    ...parsed,
    q: parsed.q || undefined,
    statuses: compact(parsed.statuses),
    priorities: compact(parsed.priorities),
    queueIds: compact(parsed.queueIds),
    assigneeMembershipIds: compact(parsed.assigneeMembershipIds),
    tags: compact(parsed.tags.map((tag) => tag.toLowerCase())),
  };
}

export function caseSearchDefinitionFromSearchParams(
  params: Record<string, string | string[] | undefined>,
): CaseSearchDefinition {
  const rawLimit = Number(first(params.limit));
  return parseCaseSearchDefinition({
    q: first(params.q),
    statuses: split(params.status),
    priorities: split(params.priority),
    queueIds: split(params.queue),
    assigneeMembershipIds: split(params.assignee),
    tags: split(params.tag),
    focus: first(params.focus) || "all",
    sort: first(params.sort) || "updated_desc",
    limit: Number.isInteger(rawLimit) && rawLimit > 0 ? rawLimit : 50,
  });
}

export function caseSearchQueryString(
  definition: CaseSearchDefinition,
) {
  const params = new URLSearchParams();
  if (definition.q) params.set("q", definition.q);
  if (definition.statuses.length) {
    params.set("status", definition.statuses.join(","));
  }
  if (definition.priorities.length) {
    params.set("priority", definition.priorities.join(","));
  }
  if (definition.queueIds.length) {
    params.set("queue", definition.queueIds.join(","));
  }
  if (definition.assigneeMembershipIds.length) {
    params.set(
      "assignee",
      definition.assigneeMembershipIds.join(","),
    );
  }
  if (definition.tags.length) {
    params.set("tag", definition.tags.join(","));
  }
  if (definition.focus !== "all") params.set("focus", definition.focus);
  if (definition.sort !== "updated_desc") params.set("sort", definition.sort);
  if (definition.limit !== 50) params.set("limit", String(definition.limit));
  return params.toString();
}


const applicationIdentifier = z
  .string()
  .min(1)
  .max(100)
  .regex(
    /^[a-z][a-z0-9_-]*$/,
    "Use lowercase identifiers with letters, numbers, underscores, or hyphens.",
  );

export const applicationOperationalFocuses = [
  "all",
  "open",
  "unassigned",
  "overdue",
  "escalated",
  "open_review",
  "recently_closed",
] as const;

export const applicationOperationalViewDefinitionSchema = z.object({
  statuses: z.array(compactString).max(20).default([]),
  priorities: z.array(compactString).max(20).default([]),
  queueSlugs: z.array(applicationIdentifier).max(20).default([]),
  tags: z.array(compactString).max(20).default([]),
  focus: z.enum(applicationOperationalFocuses).default("all"),
  sort: z.enum(caseSearchSorts).default("updated_desc"),
  limit: z.number().int().min(1).max(200).default(50),
});

export const applicationOperationalViewSchema = z.object({
  key: applicationIdentifier,
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  definition: applicationOperationalViewDefinitionSchema,
});

const operationalMetricBaseSchema = z.object({
  key: applicationIdentifier,
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
});

export const operationalMetricDefinitionSchema = z.discriminatedUnion(
  "type",
  [
    operationalMetricBaseSchema.extend({
      type: z.literal("case_count"),
      viewKey: applicationIdentifier,
    }),
    operationalMetricBaseSchema.extend({
      type: z.literal("deadline_compliance"),
      policyKeys: z.array(applicationIdentifier).min(1).max(50),
      deadlineScope: z
        .enum(["all", "case", "referral"])
        .default("all"),
      windowDays: z.number().int().min(1).max(3650).default(365),
    }),
  ],
);

export type ApplicationOperationalView = z.infer<
  typeof applicationOperationalViewSchema
>;

export type ApplicationOperationalViewDefinition = z.infer<
  typeof applicationOperationalViewDefinitionSchema
>;

export type OperationalMetricDefinition = z.infer<
  typeof operationalMetricDefinitionSchema
>;

export function applicationOperationalViewToCaseSearchDefinition(
  definition: ApplicationOperationalViewDefinition,
  queueIdsBySlug: ReadonlyMap<string, string>,
): CaseSearchDefinition {
  const queueIds = definition.queueSlugs.map((slug) => {
    const id = queueIdsBySlug.get(slug);
    if (!id) {
      throw new Error(`Operational view references unavailable queue: ${slug}`);
    }
    return id;
  });

  return parseCaseSearchDefinition({
    statuses: definition.statuses,
    priorities: definition.priorities,
    queueIds,
    assigneeMembershipIds: [],
    tags: definition.tags,
    focus: definition.focus,
    sort: definition.sort,
    limit: definition.limit,
  });
}
