import { describe, expect, it } from "vitest";
import { parseReferralPolicyDefinition } from "./definition";

describe("referral policy definition", () => {
  it("accepts parallel referral deadline policies", () => {
    const definition = parseReferralPolicyDefinition({
      schemaVersion: 1,
      deadlinePolicies: [
        {
          key: "acknowledgment",
          label: "Acknowledgment",
          trigger: "sent",
          duration: { value: 2, unit: "business_days" },
          calendarKey: "business_calendar",
          completeOnEvents: [
            "acknowledged",
            "final_response",
            "completed",
            "cancelled",
          ],
          escalation: {
            priority: "high",
            queueSlug: "oversight",
          },
        },
      ],
    });

    expect(definition.deadlinePolicies).toHaveLength(1);
    expect(definition.deadlinePolicies[0].trigger).toBe("sent");
  });

  it("requires a calendar for business-day referral deadlines", () => {
    expect(() =>
      parseReferralPolicyDefinition({
        schemaVersion: 1,
        deadlinePolicies: [
          {
            key: "acknowledgment",
            label: "Acknowledgment",
            duration: { value: 2, unit: "business_days" },
          },
        ],
      }),
    ).toThrow(/calendarKey/i);
  });

  it("rejects duplicate deadline keys", () => {
    expect(() =>
      parseReferralPolicyDefinition({
        schemaVersion: 1,
        deadlinePolicies: [
          {
            key: "response",
            label: "First",
            duration: { value: 1, unit: "calendar_days" },
          },
          {
            key: "response",
            label: "Second",
            duration: { value: 2, unit: "calendar_days" },
          },
        ],
      }),
    ).toThrow(/Duplicate referral deadline policy key/i);
  });
});
