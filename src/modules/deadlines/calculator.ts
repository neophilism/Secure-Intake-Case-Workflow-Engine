import type { DeadlinePolicy } from "@/modules/workflows/definition";

export interface DeadlineCalendarSpec {
  timeZone: string;
  weekendDays: readonly number[];
  excludedLocalDates: ReadonlySet<string>;
}

export interface CalculatedDeadline {
  dueAt: Date;
  warningAt: Date | null;
}

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

export function validateTimeZone(timeZone: string): string {
  const normalized = timeZone.trim();
  if (!normalized) throw new Error("Deadline calendar timezone is required.");

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: normalized }).format(
      new Date(),
    );
  } catch {
    throw new Error("Deadline calendar timezone is invalid.");
  }

  return normalized;
}

export function normalizeWeekendDays(
  days: readonly number[],
): number[] {
  const normalized = [...new Set(days)].sort((a, b) => a - b);
  if (
    normalized.length > 7 ||
    normalized.some(
      (value) => !Number.isInteger(value) || value < 0 || value > 6,
    )
  ) {
    throw new Error("Weekend days must be integers from 0 through 6.");
  }
  return normalized;
}

export function calculateDeadline(
  startAt: Date,
  policy: DeadlinePolicy,
  calendar: DeadlineCalendarSpec | null,
): CalculatedDeadline {
  const dueAt = addDuration(
    startAt,
    policy.duration.value,
    policy.duration.unit,
    calendar,
  );

  const warningAt = policy.warningBefore
    ? subtractDuration(
        dueAt,
        policy.warningBefore.value,
        policy.warningBefore.unit,
        calendar,
      )
    : null;

  return {
    dueAt,
    warningAt:
      warningAt && warningAt.getTime() < startAt.getTime()
        ? new Date(startAt)
        : warningAt,
  };
}

export function addDuration(
  startAt: Date,
  value: number,
  unit: "hours" | "calendar_days" | "business_days",
  calendar: DeadlineCalendarSpec | null,
): Date {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("Deadline duration must be a non-negative integer.");
  }

  if (unit === "hours") {
    return new Date(startAt.getTime() + value * 60 * 60 * 1000);
  }

  if (unit === "calendar_days") {
    return addLocalCalendarDays(
      startAt,
      value,
      calendar?.timeZone ?? "UTC",
    );
  }

  if (!calendar) {
    throw new Error("Business-day duration requires a deadline calendar.");
  }

  return addBusinessDays(startAt, value, calendar);
}

export function subtractDuration(
  endAt: Date,
  value: number,
  unit: "hours" | "calendar_days" | "business_days",
  calendar: DeadlineCalendarSpec | null,
): Date {
  if (unit === "hours") {
    return new Date(endAt.getTime() - value * 60 * 60 * 1000);
  }

  if (unit === "calendar_days") {
    return addLocalCalendarDays(
      endAt,
      -value,
      calendar?.timeZone ?? "UTC",
    );
  }

  if (!calendar) {
    throw new Error("Business-day duration requires a deadline calendar.");
  }

  return addBusinessDays(endAt, -value, calendar);
}

export function pauseExtensionMilliseconds(
  pausedAt: Date,
  resumedAt: Date,
  unit: "hours" | "calendar_days" | "business_days",
  calendar: DeadlineCalendarSpec | null,
): number {
  if (resumedAt.getTime() < pausedAt.getTime()) {
    throw new Error("Deadline resume time cannot precede pause time.");
  }

  if (unit !== "business_days") {
    return resumedAt.getTime() - pausedAt.getTime();
  }

  if (!calendar) {
    throw new Error("Business-day pause requires a deadline calendar.");
  }

  return businessMillisecondsBetween(pausedAt, resumedAt, calendar);
}

export function extendForPause(
  instant: Date,
  extensionMilliseconds: number,
  unit: "hours" | "calendar_days" | "business_days",
  calendar: DeadlineCalendarSpec | null,
): Date {
  if (extensionMilliseconds < 0) {
    throw new Error("Pause extension cannot be negative.");
  }

  if (unit !== "business_days") {
    return new Date(instant.getTime() + extensionMilliseconds);
  }

  if (!calendar) {
    throw new Error("Business-day pause requires a deadline calendar.");
  }

  return addBusinessMilliseconds(
    instant,
    extensionMilliseconds,
    calendar,
  );
}

export function localDateKey(
  instant: Date,
  timeZone: string,
): string {
  const parts = zonedParts(instant, timeZone);
  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

export function isBusinessDay(
  instant: Date,
  calendar: DeadlineCalendarSpec,
): boolean {
  const parts = zonedParts(instant, calendar.timeZone);
  const weekday = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day),
  ).getUTCDay();
  const key = localDateKey(instant, calendar.timeZone);

  return (
    !calendar.weekendDays.includes(weekday) &&
    !calendar.excludedLocalDates.has(key)
  );
}

function addBusinessDays(
  startAt: Date,
  signedDays: number,
  calendar: DeadlineCalendarSpec,
): Date {
  if (signedDays === 0) return new Date(startAt);

  const direction = signedDays > 0 ? 1 : -1;
  let remaining = Math.abs(signedDays);
  let cursor = new Date(startAt);

  while (remaining > 0) {
    cursor = addLocalCalendarDays(
      cursor,
      direction,
      calendar.timeZone,
    );
    if (isBusinessDay(cursor, calendar)) {
      remaining -= 1;
    }
  }

  return cursor;
}

function businessMillisecondsBetween(
  startAt: Date,
  endAt: Date,
  calendar: DeadlineCalendarSpec,
): number {
  if (endAt.getTime() <= startAt.getTime()) return 0;

  let cursor = new Date(startAt);
  let total = 0;

  while (cursor.getTime() < endAt.getTime()) {
    const boundary = nextLocalMidnight(cursor, calendar.timeZone);
    const segmentEnd = new Date(
      Math.min(boundary.getTime(), endAt.getTime()),
    );

    if (isBusinessDay(cursor, calendar)) {
      total += segmentEnd.getTime() - cursor.getTime();
    }

    cursor = segmentEnd;
  }

  return total;
}

function addBusinessMilliseconds(
  startAt: Date,
  milliseconds: number,
  calendar: DeadlineCalendarSpec,
): Date {
  if (milliseconds === 0) return new Date(startAt);

  let cursor = new Date(startAt);
  let remaining = milliseconds;

  while (remaining > 0) {
    const boundary = nextLocalMidnight(cursor, calendar.timeZone);
    const available = boundary.getTime() - cursor.getTime();

    if (isBusinessDay(cursor, calendar)) {
      if (remaining <= available) {
        return new Date(cursor.getTime() + remaining);
      }
      remaining -= available;
    }

    cursor = boundary;
  }

  return cursor;
}

function addLocalCalendarDays(
  instant: Date,
  signedDays: number,
  timeZone: string,
): Date {
  const parts = zonedParts(instant, timeZone);
  const local = new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day + signedDays,
      parts.hour,
      parts.minute,
      parts.second,
    ),
  );

  return zonedLocalToUtc(
    {
      year: local.getUTCFullYear(),
      month: local.getUTCMonth() + 1,
      day: local.getUTCDate(),
      hour: local.getUTCHours(),
      minute: local.getUTCMinutes(),
      second: local.getUTCSeconds(),
    },
    timeZone,
  );
}

function nextLocalMidnight(
  instant: Date,
  timeZone: string,
): Date {
  const parts = zonedParts(instant, timeZone);
  const local = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + 1),
  );

  return zonedLocalToUtc(
    {
      year: local.getUTCFullYear(),
      month: local.getUTCMonth() + 1,
      day: local.getUTCDate(),
      hour: 0,
      minute: 0,
      second: 0,
    },
    timeZone,
  );
}

function zonedParts(
  instant: Date,
  timeZone: string,
): LocalParts {
  validateTimeZone(timeZone);

  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatterCache.set(timeZone, formatter);
  }

  const values = new Map(
    formatter
      .formatToParts(instant)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: values.get("year")!,
    month: values.get("month")!,
    day: values.get("day")!,
    hour: values.get("hour")!,
    minute: values.get("minute")!,
    second: values.get("second")!,
  };
}

function zonedLocalToUtc(
  desired: LocalParts,
  timeZone: string,
): Date {
  const targetAsUtc = Date.UTC(
    desired.year,
    desired.month - 1,
    desired.day,
    desired.hour,
    desired.minute,
    desired.second,
  );

  let guess = targetAsUtc;

  for (let i = 0; i < 4; i += 1) {
    const actual = zonedParts(new Date(guess), timeZone);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    const adjustment = targetAsUtc - actualAsUtc;

    if (adjustment === 0) return new Date(guess);
    guess += adjustment;
  }

  return new Date(guess);
}
