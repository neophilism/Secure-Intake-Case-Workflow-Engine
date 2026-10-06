import { describe, expect, it } from "vitest";
import { parseReviewPolicyInput } from "./policy";

describe("review policy", () => {
  it("accepts a simple first-level review policy", () => {
    const parsed = parseReviewPolicyInput({
      key: "initial-review",
      name: "Initial Review",
      level: 1,
      eligibleCaseStatuses: ["closed"],
      filingWindow: {
        value: 30,
        unit: "calendar_days",
      },
      decisionDeadline: {
        value: 45,
        unit: "calendar_days",
        warningBefore: {
          value: 5,
          unit: "calendar_days",
        },
      },
      allowedOutcomes: [
        "affirmed",
        "modified",
        "reversed",
        "remanded",
      ],
      requireIndependentReviewer: true,
      prerequisitePolicyIds: [],
    });

    expect(parsed.key).toBe("initial-review");
    expect(parsed.level).toBe(1);
  });

  it("requires a calendar for business-day timing", () => {
    expect(() =>
      parseReviewPolicyInput({
        key: "business-review",
        name: "Business Review",
        level: 1,
        eligibleCaseStatuses: [],
        filingWindow: {
          value: 10,
          unit: "business_days",
        },
        allowedOutcomes: ["affirmed"],
        requireIndependentReviewer: true,
        prerequisitePolicyIds: [],
      }),
    ).toThrow(/calendar/i);
  });

  it("rejects duplicate outcomes", () => {
    expect(() =>
      parseReviewPolicyInput({
        key: "duplicate",
        name: "Duplicate",
        level: 1,
        eligibleCaseStatuses: [],
        allowedOutcomes: ["affirmed", "affirmed"],
        requireIndependentReviewer: true,
        prerequisitePolicyIds: [],
      }),
    ).toThrow(/unique/i);
  });
});
