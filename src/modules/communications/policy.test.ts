import { describe, expect, it } from "vitest";
import {
  canExposeDocumentInCommunication,
  parseRecipientText,
} from "./policy";

describe("communication policy", () => {
  it("normalizes email recipients and preserves recipient type", () => {
    expect(
      parseRecipientText("email", {
        to: "USER@EXAMPLE.COM",
        cc: "second@example.com",
      }),
    ).toEqual([
      { type: "to", address: "user@example.com" },
      { type: "cc", address: "second@example.com" },
    ]);
  });

  it("rejects invalid email recipients", () => {
    expect(() =>
      parseRecipientText("email", {
        to: "not-an-email",
      }),
    ).toThrow();
  });

  it("prevents internal or restricted documents from external-visible communications", () => {
    expect(
      canExposeDocumentInCommunication(
        "case_participants",
        "participant",
      ),
    ).toBe(true);
    expect(
      canExposeDocumentInCommunication(
        "case_participants",
        "internal",
      ),
    ).toBe(false);
    expect(
      canExposeDocumentInCommunication(
        "public",
        "restricted",
      ),
    ).toBe(false);
    expect(
      canExposeDocumentInCommunication(
        "internal",
        "restricted",
      ),
    ).toBe(true);
  });
});
