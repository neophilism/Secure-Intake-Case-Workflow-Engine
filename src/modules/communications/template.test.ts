import { describe, expect, it } from "vitest";
import {
  renderCommunicationTemplate,
  validateCommunicationTemplate,
} from "./template";

const values = {
  case_number: "CASE-2026-0001",
  case_title: "Sample case",
  case_status: "open",
  case_type: "public-integrity",
};

describe("communication templates", () => {
  it("renders only the supported deterministic placeholders", () => {
    expect(
      renderCommunicationTemplate(
        "Regarding {{case_number}} — {{ case_title }}",
        values,
      ),
    ).toBe("Regarding CASE-2026-0001 — Sample case");
  });

  it("rejects unknown placeholders", () => {
    expect(() =>
      validateCommunicationTemplate(
        "Secret {{arbitrary_expression}}",
      ),
    ).toThrow(/Unsupported communication template placeholder/);
  });
});
