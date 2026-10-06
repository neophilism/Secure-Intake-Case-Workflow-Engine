export const caseStatuses = [
  "intake_review",
  "accepted",
  "rejected",
  "open",
  "resolved",
  "closed",
] as const;

export type CaseStatus = (typeof caseStatuses)[number];

export const casePriorities = [
  "low",
  "normal",
  "high",
  "critical",
] as const;

export type CasePriority = (typeof casePriorities)[number];

const defaultTransitions: Record<CaseStatus, readonly CaseStatus[]> = {
  intake_review: ["accepted", "rejected"],
  accepted: ["open", "intake_review"],
  rejected: ["intake_review"],
  open: ["resolved", "closed"],
  resolved: ["open", "closed"],
  closed: ["open"],
};

export class InvalidCaseTransitionError extends Error {
  readonly fromStatus: CaseStatus;
  readonly toStatus: CaseStatus;

  constructor(fromStatus: CaseStatus, toStatus: CaseStatus) {
    super(`Case cannot transition from ${fromStatus} to ${toStatus}.`);
    this.name = "InvalidCaseTransitionError";
    this.fromStatus = fromStatus;
    this.toStatus = toStatus;
  }
}

export function isCaseStatus(value: string): value is CaseStatus {
  return (caseStatuses as readonly string[]).includes(value);
}

export function isCasePriority(value: string): value is CasePriority {
  return (casePriorities as readonly string[]).includes(value);
}

export function allowedDefaultTransitions(
  status: CaseStatus,
): readonly CaseStatus[] {
  return defaultTransitions[status];
}

export function assertDefaultCaseTransition(
  fromStatus: CaseStatus,
  toStatus: CaseStatus,
): void {
  if (!defaultTransitions[fromStatus].includes(toStatus)) {
    throw new InvalidCaseTransitionError(fromStatus, toStatus);
  }
}

export interface CaseLifecycleTimestamps {
  openedAt: Date | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
}

export function timestampsAfterTransition(
  current: CaseLifecycleTimestamps,
  toStatus: CaseStatus,
  now: Date,
): CaseLifecycleTimestamps {
  switch (toStatus) {
    case "open":
      return {
        openedAt: current.openedAt ?? now,
        resolvedAt: null,
        closedAt: null,
      };
    case "resolved":
      return {
        ...current,
        resolvedAt: now,
        closedAt: null,
      };
    case "closed":
      return {
        ...current,
        closedAt: now,
      };
    case "intake_review":
    case "accepted":
    case "rejected":
      return current;
  }
}
