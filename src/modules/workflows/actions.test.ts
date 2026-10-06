import { describe, expect, it } from "vitest";
import { applyTransitionActions } from "./actions";

describe("workflow transition actions", () => {
  it("applies lifecycle timestamps and metadata actions deterministically", () => {
    const now = new Date("2026-10-05T20:00:00.000Z");

    const result = applyTransitionActions(
      {
        priority: "normal",
        disposition: null,
        openedAt: null,
        resolvedAt: null,
        closedAt: null,
        tags: ["existing"],
      },
      [
        { type: "mark_open" },
        { type: "set_priority", value: "critical" },
        { type: "set_disposition", value: "Accepted for review" },
        { type: "add_tag", value: "Urgent Review" },
      ],
      now,
    );

    expect(result.casePatch).toEqual({
      priority: "critical",
      disposition: "Accepted for review",
      openedAt: now,
      resolvedAt: null,
      closedAt: null,
    });
    expect(result.tags).toEqual(["existing", "urgent-review"]);
  });

  it("reopening clears resolution and closure while preserving first opened time", () => {
    const firstOpened = new Date("2026-10-01T00:00:00.000Z");
    const result = applyTransitionActions(
      {
        priority: "normal",
        disposition: null,
        openedAt: firstOpened,
        resolvedAt: new Date("2026-10-02T00:00:00.000Z"),
        closedAt: new Date("2026-10-03T00:00:00.000Z"),
        tags: [],
      },
      [{ type: "mark_open" }],
      new Date("2026-10-04T00:00:00.000Z"),
    );

    expect(result.casePatch.openedAt).toBe(firstOpened);
    expect(result.casePatch.resolvedAt).toBeNull();
    expect(result.casePatch.closedAt).toBeNull();
  });
});
