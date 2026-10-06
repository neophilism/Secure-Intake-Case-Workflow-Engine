import type { RoutingRuleDefinition } from "./definition";

export const starterRoutingRuleDefinition: RoutingRuleDefinition = {
  schemaVersion: 1,
  match: "all",
  conditions: [
    {
      field: "priority",
      operator: "in",
      value: ["high", "critical"],
    },
  ],
};
