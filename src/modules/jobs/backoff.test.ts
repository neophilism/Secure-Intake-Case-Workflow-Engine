import { describe, expect, it } from "vitest";
import {
  nextScheduleRunAt,
  retryDelaySeconds,
} from "./backoff";

describe("background job timing", () => {
  it("uses capped exponential retry backoff", () => {
    expect(retryDelaySeconds(1)).toBe(5);
    expect(retryDelaySeconds(2)).toBe(10);
    expect(retryDelaySeconds(3)).toBe(20);
    expect(retryDelaySeconds(20)).toBe(900);
  });

  it("advances recurring schedules past missed intervals without replay storms", () => {
    expect(
      nextScheduleRunAt(
        new Date("2026-10-05T12:00:00Z"),
        60,
        new Date("2026-10-05T12:05:30Z"),
      ).toISOString(),
    ).toBe("2026-10-05T12:06:00.000Z");
  });
});
