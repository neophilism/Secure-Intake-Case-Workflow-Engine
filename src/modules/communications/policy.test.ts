import { describe, expect, it } from "vitest";
import {
  canExposeDocumentInCommunication,
  parseCommunicationVisibility,
  parseRecipientText,
  requireOutboundRecipients,
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

  it("normalizes legacy case participant visibility", () => {
    expect(
      parseCommunicationVisibility("case_participants"),
    ).toBe("participant");
  });

  it("prevents higher-classification documents from lower-audience communications", () => {
    expect(
      canExposeDocumentInCommunication(
        "participant",
        "participant",
      ),
    ).toBe(true);
    expect(
      canExposeDocumentInCommunication(
        "participant",
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
    ).toBe(false);
  });
  it("allows recipientless portal publication but not recipientless email", () => {
    expect(() =>
      requireOutboundRecipients("portal", []),
    ).not.toThrow();
    expect(() =>
      requireOutboundRecipients("email", []),
    ).toThrow(/requires at least one primary recipient/i);
  });

});
