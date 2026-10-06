import { describe, expect, it } from "vitest";
import { parseFormDefinition } from "./definition";

describe("form definition", () => {
  it("accepts a reusable multi-section definition", () => {
    const definition = parseFormDefinition({
      schemaVersion: 1,
      sections: [
        {
          id: "identity",
          title: "Identity",
          fields: [
            {
              id: "email",
              type: "email",
              label: "Email",
              required: true,
            },
          ],
        },
        {
          id: "details",
          title: "Details",
          fields: [
            {
              id: "urgent",
              type: "boolean",
              label: "Is this urgent?",
            },
            {
              id: "urgent_reason",
              type: "long_text",
              label: "Why is this urgent?",
              required: true,
              condition: {
                fieldId: "urgent",
                operator: "equals",
                value: true,
              },
            },
          ],
        },
      ],
    });

    expect(definition.sections).toHaveLength(2);
    expect(definition.submitLabel).toBe("Submit");
  });

  it("rejects duplicate field IDs", () => {
    expect(() =>
      parseFormDefinition({
        schemaVersion: 1,
        sections: [
          {
            id: "one",
            title: "One",
            fields: [
              { id: "same", type: "short_text", label: "First" },
              { id: "same", type: "short_text", label: "Second" },
            ],
          },
        ],
      }),
    ).toThrow(/Duplicate field id/);
  });

  it("rejects conditions that reference unknown fields", () => {
    expect(() =>
      parseFormDefinition({
        schemaVersion: 1,
        sections: [
          {
            id: "details",
            title: "Details",
            fields: [
              {
                id: "reason",
                type: "long_text",
                label: "Reason",
                condition: {
                  fieldId: "missing",
                  operator: "equals",
                  value: true,
                },
              },
            ],
          },
        ],
      }),
    ).toThrow(/unknown field/);
  });

  it("requires options for select fields", () => {
    expect(() =>
      parseFormDefinition({
        schemaVersion: 1,
        sections: [
          {
            id: "details",
            title: "Details",
            fields: [
              {
                id: "category",
                type: "select",
                label: "Category",
              },
            ],
          },
        ],
      }),
    ).toThrow(/Select fields require/);
  });
});
