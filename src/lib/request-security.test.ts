import { describe, expect, it } from "vitest";
import { isTrustedBrowserMutation } from "./request-security";

describe("browser mutation origin checks", () => {
  it("accepts the configured application origin", () => {
    const request = new Request("http://localhost:3000/example", {
      method: "POST",
      headers: { Origin: "http://localhost:3000" },
    });
    expect(isTrustedBrowserMutation(request)).toBe(true);
  });

  it("rejects cross-site origins", () => {
    const request = new Request("http://localhost:3000/example", {
      method: "POST",
      headers: {
        Origin: "https://attacker.example",
        "Sec-Fetch-Site": "cross-site",
      },
    });
    expect(isTrustedBrowserMutation(request)).toBe(false);
  });

  it("falls back to same-origin referer when Origin is absent", () => {
    const request = new Request("http://localhost:3000/example", {
      method: "POST",
      headers: { Referer: "http://localhost:3000/admin/cases" },
    });
    expect(isTrustedBrowserMutation(request)).toBe(true);
  });

  it("rejects mutations without an origin signal", () => {
    const request = new Request("http://localhost:3000/example", {
      method: "POST",
    });
    expect(isTrustedBrowserMutation(request)).toBe(false);
  });
});
