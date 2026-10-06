import { describe, expect, it } from "vitest";
import { parseApplicationManifest } from "./manifest";

const workflow = {
  schemaVersion: 1 as const,
  initialState: "submitted",
  states: [
    { key: "submitted", label: "Submitted" },
    { key: "closed", label: "Closed" },
  ],
  transitions: [
    {
      key: "close",
      label: "Close",
      from: "submitted",
      to: "closed",
      requiredPermissions: ["case:close"],
      comment: "optional" as const,
      guards: {
        requiredCaseFields: [],
        requiredSubmissionFields: [],
        requiredDocuments: [],
      },
      actions: [{ type: "mark_closed" as const }],
    },
  ],
  deadlinePolicies: [],
};

describe("application manifest", () => {
  it("parses a minimal white-label manifest", () => {
    const parsed = parseApplicationManifest({
      schemaVersion: 1,
      application: {
        key: "demo",
        name: "Demo Rights Office",
        terminology: {
          case: { singular: "Petition", plural: "Petitions" },
        },
      },
      workflows: [
        {
          slug: "petition",
          name: "Petition workflow",
          definition: workflow,
        },
      ],
      forms: [
        {
          slug: "petition",
          name: "Petition",
          workflowSlug: "petition",
          definition: {
            schemaVersion: 1,
            sections: [
              {
                id: "request",
                title: "Request",
                fields: [
                  {
                    id: "summary",
                    type: "long_text",
                    label: "Describe the issue",
                    required: true,
                  },
                ],
              },
            ],
          },
        },
      ],
    });

    expect(parsed.application.terminology.case.singular).toBe(
      "Petition",
    );
    expect(parsed.application.terminology.review.singular).toBe(
      "Review",
    );
  });

  it("rejects core role collisions", () => {
    expect(() =>
      parseApplicationManifest({
        schemaVersion: 1,
        application: { key: "demo", name: "Demo" },
        roles: [
          {
            key: "administrator",
            name: "Different administrator",
            permissions: ["case:view"],
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects unresolved cross-resource references", () => {
    expect(() =>
      parseApplicationManifest({
        schemaVersion: 1,
        application: { key: "demo", name: "Demo" },
        routingRules: [
          {
            key: "urgent",
            name: "Urgent",
            targetQueueSlug: "missing",
            definition: {
              schemaVersion: 1,
              match: "all",
              conditions: [
                {
                  field: "priority",
                  operator: "equals",
                  value: "urgent",
                },
              ],
            },
          },
        ],
      }),
    ).toThrow();
  });
});
