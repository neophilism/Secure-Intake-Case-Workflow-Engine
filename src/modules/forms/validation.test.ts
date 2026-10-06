import { describe, expect, it } from "vitest";
import { parseFormDefinition } from "./definition";
import { validateSubmissionAnswers } from "./validation";

const definition = parseFormDefinition({
  schemaVersion: 1,
  sections: [
    {
      id: "request",
      title: "Request",
      fields: [
        {
          id: "email",
          type: "email",
          label: "Email",
          required: true,
        },
        {
          id: "urgent",
          type: "boolean",
          label: "Urgent",
        },
        {
          id: "urgent_reason",
          type: "long_text",
          label: "Urgent reason",
          required: true,
          condition: {
            fieldId: "urgent",
            operator: "equals",
            value: true,
          },
        },
        {
          id: "topics",
          type: "multiselect",
          label: "Topics",
          options: [
            { value: "privacy", label: "Privacy" },
            { value: "records", label: "Records" },
          ],
        },
      ],
    },
  ],
});

describe("submission validation", () => {
  it("does not require a hidden conditional field", () => {
    const result = validateSubmissionAnswers(definition, {
      email: "person@example.test",
      urgent: false,
    });

    expect(result.success).toBe(true);
  });

  it("requires a conditional field when its condition is met", () => {
    const result = validateSubmissionAnswers(definition, {
      email: "person@example.test",
      urgent: true,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors).toContainEqual({
        fieldId: "urgent_reason",
        message: "This field is required.",
      });
    }
  });

  it("rejects invalid option values", () => {
    const result = validateSubmissionAnswers(definition, {
      email: "person@example.test",
      topics: ["not-a-real-option"],
    });

    expect(result.success).toBe(false);
  });

  it("strips unknown and conditionally hidden answers before persistence", () => {
    const result = validateSubmissionAnswers(definition, {
      email: "person@example.test",
      urgent: false,
      urgent_reason: "A malicious client tried to force hidden data.",
      unexpected_admin_flag: true,
    });

    expect(result.answers).toEqual({
      email: "person@example.test",
      urgent: false,
    });
  });

  it("allows incomplete drafts while still validating supplied values", () => {
    const result = validateSubmissionAnswers(
      definition,
      { urgent: false },
      { partial: true },
    );

    expect(result.success).toBe(true);

    const invalidEmail = validateSubmissionAnswers(
      definition,
      { email: "not-an-email" },
      { partial: true },
    );
    expect(invalidEmail.success).toBe(false);
  });
});
