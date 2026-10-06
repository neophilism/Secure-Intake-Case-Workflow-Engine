import { describe, expect, it } from "vitest";
import {
  calculateDeadline,
  extendForPause,
  pauseExtensionMilliseconds,
  type DeadlineCalendarSpec,
} from "./calculator";
import { parseWorkflowDefinition } from "@/modules/workflows/definition";

const calendar: DeadlineCalendarSpec = {
  timeZone: "America/New_York",
  weekendDays: [0, 6],
  excludedLocalDates: new Set(["2026-10-12"]),
};

function policy(input: Record<string, unknown>) {
  return parseWorkflowDefinition({
    schemaVersion: 1,
    initialState: "open",
    states: [{ key: "open", label: "Open" }],
    transitions: [],
    deadlinePolicies: [input],
  }).deadlinePolicies[0];
}

describe("deadline calculator", () => {
  it("counts calendar days while preserving local wall-clock time", () => {
    const deadline = calculateDeadline(
      new Date("2026-03-07T15:00:00Z"),
      policy({
        key: "calendar",
        label: "Calendar",
        trigger: { type: "case_created" },
        duration: { value: 2, unit: "calendar_days" },
      }),
      null,
    );

    expect(deadline.dueAt.toISOString()).toBe(
      "2026-03-09T15:00:00.000Z",
    );
  });

  it("skips weekends and explicit exclusions for business days", () => {
    const deadline = calculateDeadline(
      new Date("2026-10-09T14:00:00Z"),
      policy({
        key: "business",
        label: "Business",
        trigger: { type: "case_created" },
        duration: { value: 1, unit: "business_days" },
        calendarKey: "federal",
      }),
      calendar,
    );

    expect(deadline.dueAt.toISOString()).toBe(
      "2026-10-13T14:00:00.000Z",
    );
  });

  it("does not count weekend time when extending a business-day pause", () => {
    const pausedAt = new Date("2026-10-09T16:00:00Z");
    const resumedAt = new Date("2026-10-12T16:00:00Z");

    const extension = pauseExtensionMilliseconds(
      pausedAt,
      resumedAt,
      "business_days",
      {
        ...calendar,
        excludedLocalDates: new Set(),
      },
    );

    expect(extension).toBe(24 * 60 * 60 * 1000);

    const extended = extendForPause(
      new Date("2026-10-13T16:00:00Z"),
      extension,
      "business_days",
      {
        ...calendar,
        excludedLocalDates: new Set(),
      },
    );

    expect(extended.toISOString()).toBe(
      "2026-10-14T16:00:00.000Z",
    );
  });
});
