import { describe, expect, it } from "vitest";
import { parseRoutingRuleDefinition } from "./definition";
import { routingRuleMatches } from "./evaluator";

const context = {
  caseType: "civil-rights",
  priority: "high",
  status: "intake_review",
  tags: ["urgent", "privacy"],
  submissionAnswers: {
    region: "east",
    topics: ["records", "privacy"],
  },
};

describe("routing rule evaluation", () => {
  it("matches all conditions deterministically", () => {
    const definition = parseRoutingRuleDefinition({
      schemaVersion: 1,
      match: "all",
      conditions: [
        {
          field: "priority",
          operator: "in",
          value: ["high", "critical"],
        },
        {
          field: "tag",
          operator: "includes",
          value: "urgent",
        },
        {
          field: "submission",
          fieldId: "region",
          operator: "equals",
          value: "east",
        },
      ],
    });

    expect(routingRuleMatches(definition, context)).toBe(true);
  });

  it("supports any-match routing", () => {
    const definition = parseRoutingRuleDefinition({
      schemaVersion: 1,
      match: "any",
      conditions: [
        {
          field: "status",
          operator: "equals",
          value: "closed",
        },
        {
          field: "submission",
          fieldId: "topics",
          operator: "includes",
          value: "privacy",
        },
      ],
    });

    expect(routingRuleMatches(definition, context)).toBe(true);
  });

  it("fails when an all-match condition is false", () => {
    const definition = parseRoutingRuleDefinition({
      schemaVersion: 1,
      conditions: [
        {
          field: "case_type",
          operator: "equals",
          value: "criminal",
        },
      ],
    });

    expect(routingRuleMatches(definition, context)).toBe(false);
  });
});
