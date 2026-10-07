import { describe, expect, it } from "vitest";
import { parseFormDefinition } from "./definition";
import { answersFromFormData } from "./form-data";

describe("form data parsing", () => {
  it("normalizes common browser form values", () => {
    const definition = parseFormDefinition({
      schemaVersion: 1,
      sections: [
        {
          id: "details",
          title: "Details",
          fields: [
            { id: "count", type: "number", label: "Count" },
            { id: "consent", type: "boolean", label: "Consent" },
            {
              id: "topics",
              type: "multiselect",
              label: "Topics",
              options: [
                { value: "a", label: "A" },
                { value: "b", label: "B" },
              ],
            },
            { id: "address", type: "address", label: "Address" },
          ],
        },
      ],
    });

    const formData = new FormData();
    formData.set("count", "42");
    formData.set("consent", "true");
    formData.append("topics", "a");
    formData.append("topics", "b");
    formData.set("address.line1", "1 Main St");
    formData.set("address.city", "Washington");

    expect(answersFromFormData(definition, formData)).toEqual({
      count: 42,
      consent: true,
      topics: ["a", "b"],
      address: {
        line1: "1 Main St",
        line2: "",
        city: "Washington",
        region: "",
        postalCode: "",
        country: "",
      },
    });
  });
  it("does not treat browser File objects as ordinary answer references", () => {
    const definition = parseFormDefinition({
      schemaVersion: 1,
      sections: [
        {
          id: "files",
          title: "Files",
          fields: [
            { id: "attachment", type: "file", label: "Attachment" },
          ],
        },
      ],
    });
    const formData = new FormData();
    formData.append(
      "attachment",
      new File(["example"], "example.txt", { type: "text/plain" }),
    );

    expect(answersFromFormData(definition, formData)).toEqual({});
  });

});
