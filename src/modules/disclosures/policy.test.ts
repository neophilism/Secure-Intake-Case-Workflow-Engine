import { describe, expect, it } from "vitest";
import {
  canExposeToAudience,
  parseInformationClass,
} from "./policy";

describe("information classification", () => {
  it("normalizes the legacy participant label", () => {
    expect(parseInformationClass("case_participants")).toBe(
      "participant",
    );
  });

  it("allows only public information in public audience", () => {
    expect(canExposeToAudience("public", "public")).toBe(true);
    expect(canExposeToAudience("participant", "public")).toBe(
      false,
    );
    expect(canExposeToAudience("internal", "public")).toBe(false);
    expect(canExposeToAudience("restricted", "public")).toBe(
      false,
    );
  });

  it("allows public and participant information to participants", () => {
    expect(
      canExposeToAudience("public", "participant"),
    ).toBe(true);
    expect(
      canExposeToAudience("participant", "participant"),
    ).toBe(true);
    expect(
      canExposeToAudience("internal", "participant"),
    ).toBe(false);
  });
});
