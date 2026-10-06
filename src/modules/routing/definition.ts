import { z } from "zod";

const identifier = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z][a-z0-9_-]*$/);

const scalar = z.union([z.string(), z.number(), z.boolean()]);

export const routingConditionSchema = z.discriminatedUnion("field", [
  z.object({
    field: z.literal("case_type"),
    operator: z.enum(["equals", "not_equals", "in"]),
    value: z.union([z.string(), z.array(z.string()).min(1)]),
  }),
  z.object({
    field: z.literal("priority"),
    operator: z.enum(["equals", "not_equals", "in"]),
    value: z.union([z.string(), z.array(z.string()).min(1)]),
  }),
  z.object({
    field: z.literal("status"),
    operator: z.enum(["equals", "not_equals", "in"]),
    value: z.union([z.string(), z.array(z.string()).min(1)]),
  }),
  z.object({
    field: z.literal("tag"),
    operator: z.enum(["includes", "not_includes"]),
    value: z.string().min(1).max(100),
  }),
  z.object({
    field: z.literal("submission"),
    fieldId: identifier,
    operator: z.enum([
      "equals",
      "not_equals",
      "includes",
      "exists",
      "in",
    ]),
    value: z.union([scalar, z.array(scalar).min(1)]).optional(),
  }),
]);

export type RoutingCondition = z.infer<
  typeof routingConditionSchema
>;

export const routingRuleDefinitionSchema = z.object({
  schemaVersion: z.literal(1),
  match: z.enum(["all", "any"]).default("all"),
  conditions: z.array(routingConditionSchema).min(1).max(100),
});

export type RoutingRuleDefinition = z.infer<
  typeof routingRuleDefinitionSchema
>;

export function parseRoutingRuleDefinition(
  input: unknown,
): RoutingRuleDefinition {
  return routingRuleDefinitionSchema.parse(input);
}
