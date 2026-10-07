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
  it("requires public file fields to reference declared document types", () => {
    expect(() =>
      parseApplicationManifest({
        schemaVersion: 1,
        application: { key: "demo", name: "Demo" },
        forms: [
          {
            slug: "demo",
            name: "Demo",
            definition: {
              schemaVersion: 1,
              sections: [
                {
                  id: "files",
                  title: "Files",
                  fields: [
                    {
                      id: "attachment",
                      type: "file",
                      label: "Attachment",
                      publicUpload: {
                        documentTypeKey: "missing_type",
                      },
                    },
                  ],
                },
              ],
            },
          },
        ],
      }),
    ).toThrow(/undeclared document type/i);
  });

  it("rejects file MIME policy broader than its bound document type", () => {
    expect(() =>
      parseApplicationManifest({
        schemaVersion: 1,
        application: { key: "demo", name: "Demo" },
        documentTypes: [
          {
            key: "support",
            name: "Support",
            acceptedMimeTypes: ["application/pdf"],
          },
        ],
        forms: [
          {
            slug: "demo",
            name: "Demo",
            definition: {
              schemaVersion: 1,
              sections: [
                {
                  id: "files",
                  title: "Files",
                  fields: [
                    {
                      id: "attachment",
                      type: "file",
                      label: "Attachment",
                      acceptedMimeTypes: ["application/pdf", "image/png"],
                      publicUpload: {
                        documentTypeKey: "support",
                      },
                    },
                  ],
                },
              ],
            },
          },
        ],
      }),
    ).toThrow(/subset of its document type policy/i);
  });

  it("validates referral deadline calendar and escalation references", () => {
    expect(() =>
      parseApplicationManifest({
        schemaVersion: 1,
        application: { key: "demo", name: "Demo" },
        referralPolicies: [
          {
            key: "external_referral",
            name: "External Referral",
            definition: {
              schemaVersion: 1,
              deadlinePolicies: [
                {
                  key: "response",
                  label: "Response",
                  duration: { value: 2, unit: "business_days" },
                  calendarKey: "missing_calendar",
                  completeOnEvents: ["final_response"],
                  escalation: {
                    queueSlug: "missing_queue",
                  },
                },
              ],
            },
          },
        ],
      }),
    ).toThrow(/undeclared calendar|undeclared queue/i);
  });


  it("rejects operational views that reference undeclared queues", () => {
    expect(() =>
      parseApplicationManifest({
        schemaVersion: 1,
        application: { key: "demo", name: "Demo" },
        operationalViews: [
          {
            key: "missing_queue",
            name: "Missing Queue",
            definition: { queueSlugs: ["not_declared"] },
          },
        ],
      }),
    ).toThrow(/undeclared queue/i);
  });

  it("rejects operational metrics with missing view or deadline references", () => {
    expect(() =>
      parseApplicationManifest({
        schemaVersion: 1,
        application: { key: "demo", name: "Demo" },
        operationalMetrics: [
          {
            key: "count",
            name: "Count",
            type: "case_count",
            viewKey: "missing_view",
          },
        ],
      }),
    ).toThrow(/undeclared operational view/i);

    expect(() =>
      parseApplicationManifest({
        schemaVersion: 1,
        application: { key: "demo", name: "Demo" },
        operationalMetrics: [
          {
            key: "sla",
            name: "SLA",
            type: "deadline_compliance",
            policyKeys: ["missing_deadline"],
          },
        ],
      }),
    ).toThrow(/undeclared deadline policy/i);
  });


});
