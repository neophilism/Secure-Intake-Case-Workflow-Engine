export const casePriorities = [
  "low",
  "normal",
  "high",
  "critical",
] as const;

export type CasePriority = (typeof casePriorities)[number];

export function isCasePriority(value: string): value is CasePriority {
  return (casePriorities as readonly string[]).includes(value);
}
