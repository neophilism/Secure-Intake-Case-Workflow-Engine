import { describe, expect, it } from "vitest";
import {
  allowedDefaultTransitions,
  assertDefaultCaseTransition,
  InvalidCaseTransitionError,
  timestampsAfterTransition,
} from "./lifecycle";

describe("default case lifecycle", () => {
  it("models intake review through disposition without statute-specific states", () => {
    expect(allowedDefaultTransitions("intake_review")).toEqual([
      "accepted",
      "rejected",
    ]);
    expect(allowedDefaultTransitions("accepted")).toContain("open");
    expect(allowedDefaultTransitions("open")).toEqual([
      "resolved",
      "closed",
    ]);
  });

  it("rejects transitions outside the default lifecycle", () => {
    expect(() =>
      assertDefaultCaseTransition("intake_review", "closed"),
    ).toThrow(InvalidCaseTransitionError);
  });

  it("supports controlled reopening", () => {
    expect(() =>
      assertDefaultCaseTransition("closed", "open"),
    ).not.toThrow();
    expect(() =>
      assertDefaultCaseTransition("rejected", "intake_review"),
    ).not.toThrow();
  });

  it("tracks open, resolve, close, and reopen timestamps", () => {
    const opened = new Date("2026-10-05T12:00:00.000Z");
    const resolved = new Date("2026-10-06T12:00:00.000Z");
    const closed = new Date("2026-10-07T12:00:00.000Z");
    const reopened = new Date("2026-10-08T12:00:00.000Z");

    const afterOpen = timestampsAfterTransition(
      { openedAt: null, resolvedAt: null, closedAt: null },
      "open",
      opened,
    );
    expect(afterOpen).toEqual({
      openedAt: opened,
      resolvedAt: null,
      closedAt: null,
    });

    const afterResolved = timestampsAfterTransition(
      afterOpen,
      "resolved",
      resolved,
    );
    expect(afterResolved.resolvedAt).toBe(resolved);

    const afterClosed = timestampsAfterTransition(
      afterResolved,
      "closed",
      closed,
    );
    expect(afterClosed.closedAt).toBe(closed);

    const afterReopen = timestampsAfterTransition(
      afterClosed,
      "open",
      reopened,
    );
    expect(afterReopen).toEqual({
      openedAt: opened,
      resolvedAt: null,
      closedAt: null,
    });
  });
});
