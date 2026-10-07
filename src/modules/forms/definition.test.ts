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

  it("rejects conditions that reference later fields", () => {
    expect(() =>
      parseFormDefinition({
        schemaVersion: 1,
        sections: [
          {
            id: "details",
            title: "Details",
            fields: [
              {
                id: "dependent",
                type: "short_text",
                label: "Dependent",
                condition: {
                  fieldId: "controller",
                  operator: "equals",
                  value: "yes",
                },
              },
              {
                id: "controller",
                type: "short_text",
                label: "Controller",
              },
            ],
          },
        ],
      }),
    ).toThrow(/earlier/);
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

  it("accepts dual-control protected form fields", () => {
    const definition = parseFormDefinition({
      schemaVersion: 1,
      sections: [
        {
          id: "details",
          title: "Details",
          fields: [
            {
              id: "protected_value",
              type: "short_text",
              label: "Protected value",
              protection: { compartment: "identity" },
            },
          ],
        },
      ],
    });

    expect(
      definition.sections[0].fields[0].protection,
    ).toEqual({
      compartment: "identity",
      revealPolicy: "dual_control",
    });
  });

  it("rejects protected file references until protected document storage exists", () => {
    expect(() =>
      parseFormDefinition({
        schemaVersion: 1,
        sections: [
          {
            id: "details",
            title: "Details",
            fields: [
              {
                id: "attachment",
                type: "file",
                label: "Attachment",
                protection: { compartment: "identity" },
              },
            ],
          },
        ],
      }),
    ).toThrow(/File fields cannot use protected compartments/);
  });

  it("prevents protected values from controlling ordinary-field visibility", () => {
    expect(() =>
      parseFormDefinition({
        schemaVersion: 1,
        sections: [
          {
            id: "details",
            title: "Details",
            fields: [
              {
                id: "protected_controller",
                type: "boolean",
                label: "Protected controller",
                protection: { compartment: "identity" },
              },
              {
                id: "ordinary_dependent",
                type: "short_text",
                label: "Ordinary dependent",
                condition: {
                  fieldId: "protected_controller",
                  operator: "equals",
                  value: true,
                },
              },
            ],
          },
        ],
      }),
    ).toThrow(/same protected compartment/);
  });

  it("parses an opt-in participant portal policy", () => {
    const definition = parseFormDefinition({
      schemaVersion: 1,
      participantPortal: {
        enabled: true,
      },
      sections: [
        {
          id: "details",
          title: "Details",
          fields: [
            {
              id: "value",
              type: "short_text",
              label: "Value",
            },
          ],
        },
      ],
    });

    expect(definition.participantPortal).toEqual({
      enabled: true,
      allowMessaging: true,
    });
  });


  it("accepts participant messaging conditioned on an ordinary field", () => {
    const definition = parseFormDefinition({
      schemaVersion: 1,
      participantPortal: {
        enabled: true,
        allowMessaging: true,
        messagingCondition: {
          fieldId: "contact_mode",
          operator: "not_equals",
          value: "anonymous",
        },
      },
      sections: [
        {
          id: "details",
          title: "Details",
          fields: [
            {
              id: "contact_mode",
              type: "select",
              label: "Contact mode",
              required: true,
              options: [
                { value: "anonymous", label: "Anonymous" },
                { value: "contactable", label: "Contactable" },
              ],
            },
          ],
        },
      ],
    });

    expect(
      definition.participantPortal?.messagingCondition,
    ).toEqual({
      fieldId: "contact_mode",
      operator: "not_equals",
      value: "anonymous",
    });
  });

  it("rejects participant messaging conditions that reference protected fields", () => {
    expect(() =>
      parseFormDefinition({
        schemaVersion: 1,
        participantPortal: {
          enabled: true,
          allowMessaging: true,
          messagingCondition: {
            fieldId: "protected_mode",
            operator: "equals",
            value: "yes",
          },
        },
        sections: [
          {
            id: "details",
            title: "Details",
            fields: [
              {
                id: "protected_mode",
                type: "short_text",
                label: "Protected mode",
                protection: {
                  compartment: "identity",
                  revealPolicy: "dual_control",
                },
              },
            ],
          },
        ],
      }),
    ).toThrow(/ordinary, non-protected field/);
  });

  it("rejects participant messaging conditions when messaging is disabled", () => {
    expect(() =>
      parseFormDefinition({
        schemaVersion: 1,
        participantPortal: {
          enabled: true,
          allowMessaging: false,
          messagingCondition: {
            fieldId: "contact_mode",
            operator: "equals",
            value: "contactable",
          },
        },
        sections: [
          {
            id: "details",
            title: "Details",
            fields: [
              {
                id: "contact_mode",
                type: "short_text",
                label: "Contact mode",
              },
            ],
          },
        ],
      }),
    ).toThrow(/cannot be used when allowMessaging is false/);
  });

});
