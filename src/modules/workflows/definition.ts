import { z } from "zod";
import { casePriorities } from "@/modules/cases/lifecycle";

const identifier = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z][a-z0-9_-]*$/, "Use lowercase identifiers with letters, numbers, underscores, or hyphens.");

const permission = z.string().min(1).max(200);

export const workflowStateSchema = z.object({
  key: identifier,
  label: z.string().min(1).max(300),
  description: z.string().max(2000).optional(),
});

export type WorkflowState = z.infer<typeof workflowStateSchema>;

export const requiredDocumentSchema = z.object({
  type: identifier,
  minCount: z.number().int().positive().max(100).default(1),
});

export const transitionGuardSchema = z.object({
  requiredCaseFields: z
    .array(
      z.enum([
        "title",
        "summary",
        "disposition",
        "source_submission",
      ]),
    )
    .max(20)
    .default([]),
  requiredSubmissionFields: z.array(identifier).max(200).default([]),
  requiredDocuments: z.array(requiredDocumentSchema).max(100).default([]),
});

export const transitionActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("mark_open") }),
  z.object({ type: z.literal("mark_resolved") }),
  z.object({ type: z.literal("mark_closed") }),
  z.object({
    type: z.literal("set_priority"),
    value: z.enum(casePriorities),
  }),
  z.object({
    type: z.literal("set_disposition"),
    value: z.string().min(1).max(500),
  }),
  z.object({ type: z.literal("clear_disposition") }),
  z.object({
    type: z.literal("add_tag"),
    value: z.string().min(1).max(100),
  }),
  z.object({
    type: z.literal("remove_tag"),
    value: z.string().min(1).max(100),
  }),
]);

export type TransitionAction = z.infer<typeof transitionActionSchema>;


export const deadlineDurationUnitSchema = z.enum([
  "hours",
  "calendar_days",
  "business_days",
]);

export const deadlineDurationSchema = z.object({
  value: z.number().int().positive().max(36500),
  unit: deadlineDurationUnitSchema,
});

export const deadlineTriggerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("case_created") }),
  z.object({
    type: z.literal("transition"),
    transitionKey: identifier,
  }),
]);

export const deadlineEscalationSchema = z
  .object({
    priority: z.enum(casePriorities).optional(),
    queueSlug: identifier.optional(),
  })
  .refine(
    (value) => value.priority !== undefined || value.queueSlug !== undefined,
    "Deadline escalation must set a priority, a queue, or both.",
  );

export const deadlinePolicySchema = z.object({
  key: identifier,
  label: z.string().min(1).max(300),
  description: z.string().max(2000).optional(),
  trigger: deadlineTriggerSchema,
  duration: deadlineDurationSchema,
  warningBefore: deadlineDurationSchema.optional(),
  calendarKey: identifier.optional(),
  pausable: z.boolean().default(false),
  completeOnTransitions: z.array(identifier).max(100).default([]),
  escalation: deadlineEscalationSchema.optional(),
});

export type DeadlinePolicy = z.infer<typeof deadlinePolicySchema>;

export const workflowTransitionSchema = z.object({
  key: identifier,
  label: z.string().min(1).max(300),
  from: identifier,
  to: identifier,
  requiredPermissions: z.array(permission).min(1).max(50),
  comment: z
    .enum(["optional", "required", "forbidden"])
    .default("optional"),
  guards: transitionGuardSchema.default({
    requiredCaseFields: [],
    requiredSubmissionFields: [],
    requiredDocuments: [],
  }),
  actions: z.array(transitionActionSchema).max(50).default([]),
});

export type WorkflowTransition = z.infer<
  typeof workflowTransitionSchema
>;

export const workflowDefinitionSchema = z
  .object({
    schemaVersion: z.literal(1),
    initialState: identifier,
    states: z.array(workflowStateSchema).min(1).max(200),
    transitions: z.array(workflowTransitionSchema).max(1000),
    deadlinePolicies: z.array(deadlinePolicySchema).max(200).default([]),
  })
  .superRefine((definition, ctx) => {
    const stateKeys = new Set<string>();
    const transitionKeys = new Set<string>();

    definition.states.forEach((state, index) => {
      if (stateKeys.has(state.key)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate state key: ${state.key}`,
          path: ["states", index, "key"],
        });
      }
      stateKeys.add(state.key);
    });

    if (!stateKeys.has(definition.initialState)) {
      ctx.addIssue({
        code: "custom",
        message: "initialState must reference a declared state.",
        path: ["initialState"],
      });
    }

    definition.transitions.forEach((transition, index) => {
      if (transitionKeys.has(transition.key)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate transition key: ${transition.key}`,
          path: ["transitions", index, "key"],
        });
      }
      transitionKeys.add(transition.key);

      if (!stateKeys.has(transition.from)) {
        ctx.addIssue({
          code: "custom",
          message: `Unknown transition source state: ${transition.from}`,
          path: ["transitions", index, "from"],
        });
      }

      if (!stateKeys.has(transition.to)) {
        ctx.addIssue({
          code: "custom",
          message: `Unknown transition target state: ${transition.to}`,
          path: ["transitions", index, "to"],
        });
      }

      if (transition.from === transition.to) {
        ctx.addIssue({
          code: "custom",
          message: "A transition must change state.",
          path: ["transitions", index],
        });
      }
    });

    const deadlineKeys = new Set<string>();
    definition.deadlinePolicies.forEach((policy, index) => {
      if (deadlineKeys.has(policy.key)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate deadline policy key: ${policy.key}`,
          path: ["deadlinePolicies", index, "key"],
        });
      }
      deadlineKeys.add(policy.key);

      if (
        policy.trigger.type === "transition" &&
        !transitionKeys.has(policy.trigger.transitionKey)
      ) {
        ctx.addIssue({
          code: "custom",
          message: `Unknown deadline trigger transition: ${policy.trigger.transitionKey}`,
          path: ["deadlinePolicies", index, "trigger", "transitionKey"],
        });
      }

      policy.completeOnTransitions.forEach((transitionKey, completionIndex) => {
        if (!transitionKeys.has(transitionKey)) {
          ctx.addIssue({
            code: "custom",
            message: `Unknown deadline completion transition: ${transitionKey}`,
            path: [
              "deadlinePolicies",
              index,
              "completeOnTransitions",
              completionIndex,
            ],
          });
        }
      });

      const usesBusinessDays =
        policy.duration.unit === "business_days" ||
        policy.warningBefore?.unit === "business_days";

      if (usesBusinessDays && !policy.calendarKey) {
        ctx.addIssue({
          code: "custom",
          message:
            "Business-day deadline policies require calendarKey.",
          path: ["deadlinePolicies", index, "calendarKey"],
        });
      }
    });
  });

export type WorkflowDefinition = z.infer<
  typeof workflowDefinitionSchema
>;

export function parseWorkflowDefinition(
  input: unknown,
): WorkflowDefinition {
  return workflowDefinitionSchema.parse(input);
}

export function findWorkflowState(
  definition: WorkflowDefinition,
  key: string,
): WorkflowState | null {
  return definition.states.find((state) => state.key === key) ?? null;
}

export function transitionsFromState(
  definition: WorkflowDefinition,
  state: string,
): WorkflowTransition[] {
  return definition.transitions.filter(
    (transition) => transition.from === state,
  );
}

export function findTransition(
  definition: WorkflowDefinition,
  transitionKey: string,
  fromState?: string,
): WorkflowTransition | null {
  return (
    definition.transitions.find(
      (transition) =>
        transition.key === transitionKey &&
        (fromState === undefined || transition.from === fromState),
    ) ?? null
  );
}
