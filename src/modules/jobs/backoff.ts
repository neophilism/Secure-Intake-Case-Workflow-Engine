export function retryDelaySeconds(
  attemptNumber: number,
  options: { baseSeconds?: number; maxSeconds?: number } = {},
): number {
  if (!Number.isInteger(attemptNumber) || attemptNumber < 1) {
    throw new Error("Attempt number must be a positive integer.");
  }

  const base = options.baseSeconds ?? 5;
  const max = options.maxSeconds ?? 900;
  if (base < 1 || max < base) {
    throw new Error("Retry backoff configuration is invalid.");
  }

  return Math.min(max, base * 2 ** (attemptNumber - 1));
}

export function nextScheduleRunAt(
  scheduledAt: Date,
  intervalSeconds: number,
  now: Date,
): Date {
  if (!Number.isInteger(intervalSeconds) || intervalSeconds < 1) {
    throw new Error("Schedule interval must be positive.");
  }

  const intervalMs = intervalSeconds * 1000;
  let next = scheduledAt.getTime() + intervalMs;

  if (next <= now.getTime()) {
    const missed =
      Math.floor((now.getTime() - next) / intervalMs) + 1;
    next += missed * intervalMs;
  }

  return new Date(next);
}
