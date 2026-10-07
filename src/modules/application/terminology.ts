import type { ApplicationTerminology } from "./manifest";

export const defaultApplicationTerminology: ApplicationTerminology = {
  case: { singular: "Case", plural: "Cases" },
  submission: { singular: "Submission", plural: "Submissions" },
  submitter: { singular: "Submitter", plural: "Submitters" },
  review: { singular: "Review", plural: "Reviews" },
  deadline: { singular: "Deadline", plural: "Deadlines" },
  document: { singular: "Document", plural: "Documents" },
  queue: { singular: "Queue", plural: "Queues" },
  referral: { singular: "Referral", plural: "Referrals" },
};

export type TerminologyKey = keyof ApplicationTerminology;

export function applicationTerm(
  terminology: Record<string, unknown> | null | undefined,
  key: TerminologyKey,
  count = 1,
) {
  const candidate = terminology?.[key];
  if (
    candidate &&
    typeof candidate === "object" &&
    !Array.isArray(candidate)
  ) {
    const value = candidate as Record<string, unknown>;
    const label = count === 1 ? value.singular : value.plural;
    if (typeof label === "string" && label.trim()) {
      return label.trim();
    }
  }

  const fallback = defaultApplicationTerminology[key];
  return count === 1 ? fallback.singular : fallback.plural;
}
