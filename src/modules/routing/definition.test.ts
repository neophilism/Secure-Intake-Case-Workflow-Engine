import { describe, expect, it } from "vitest";
import { parseRoutingRuleDefinition } from "./definition";

describe("routing rule definition", () => {
  it("parses a multi-condition rule", () => {
    const rule = parseRoutingRuleDefinition({
      schemaVersion: 1,
      match: "all",
      conditions: [
        {
          field: "priority",
          operator: "in",
          value: ["high", "critical"],
        },
        {
          field: "submission",
          fieldId: "region",
          operator: "equals",
          value: "east",
        },
      ],
    });

    expect(rule.conditions).toHaveLength(2);
  });

  it("rejects rules without conditions", () => {
    expect(() =>
      parseRoutingRuleDefinition({
        schemaVersion: 1,
        conditions: [],
      }),
    ).toThrow();
  });
});
