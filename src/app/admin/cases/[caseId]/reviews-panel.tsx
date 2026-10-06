import type {
  listCaseReviewHistory,
  listCaseReviews,
  listReviewPolicies,
  listEligibleReviewers,
} from "@/modules/reviews/repository";
import type { listOrganizationMembers } from "@/modules/routing/repository";
import type { WorkflowState } from "@/modules/workflows/definition";
import { parseReviewPolicySnapshot } from "@/modules/reviews/policy";
import {
  applyReviewDecisionAction,
  assignReviewAction,
  beginReviewAction,
  decideReviewAction,
  fileCaseReviewAction,
  withdrawReviewAction,
} from "./actions";

type Reviews = Awaited<ReturnType<typeof listCaseReviews>>;
type ReviewHistory = Awaited<
  ReturnType<typeof listCaseReviewHistory>
>;
type Policies = Awaited<ReturnType<typeof listReviewPolicies>>;
type Members = Awaited<
  ReturnType<typeof listOrganizationMembers>
>;
type EligibleReviewers = Awaited<
  ReturnType<typeof listEligibleReviewers>
>;

export function CaseReviewsPanel({
  caseId,
  currentCaseStatus,
  reviews,
  history,
  policies,
  members,
  eligibleReviewers,
  workflowStates,
  currentMembershipId,
  currentUserId,
  canFile,
  canAssign,
  canDecide,
  canManage,
  canApplyCaseEffect,
}: {
  caseId: string;
  currentCaseStatus: string;
  reviews: Reviews;
  history: ReviewHistory;
  policies: Policies;
  members: Members;
  eligibleReviewers: EligibleReviewers;
  workflowStates: readonly WorkflowState[];
  currentMembershipId: string | null;
  currentUserId: string;
  canFile: boolean;
  canAssign: boolean;
  canDecide: boolean;
  canManage: boolean;
  canApplyCaseEffect: boolean;
}) {
  const memberById = new Map(
    members.map((member) => [
      member.membershipId,
      member,
    ]),
  );
  const historyByReview = new Map<string, ReviewHistory>();

  for (const entry of history) {
    const current = historyByReview.get(entry.reviewId) ?? [];
    current.push(entry);
    historyByReview.set(entry.reviewId, current);
  }

  const decidedReviews = reviews.filter(
    (review) => review.status === "decided",
  );
  const activePolicies = policies.filter(
    (policy) => policy.status === "active",
  );

  return (
    <section>
      <h2>Review, reconsideration, and appeal</h2>

      {reviews.length === 0 ? (
        <p>No reviews have been filed for this case.</p>
      ) : (
        <ol>
          {reviews.map((review) => {
            const reviewer = review.reviewerMembershipId
              ? memberById.get(review.reviewerMembershipId)
              : null;
            const reviewHistory =
              historyByReview.get(review.id) ?? [];
            const policySnapshot =
              parseReviewPolicySnapshot(
                review.policySnapshot,
              );
            const isAssignedReviewer =
              Boolean(currentMembershipId) &&
              currentMembershipId ===
                review.reviewerMembershipId;
            const isOpen = [
              "filed",
              "assigned",
              "under_review",
            ].includes(review.status);
            const canWithdraw =
              isOpen &&
              (canManage ||
                (canFile &&
                  review.filedByUserId === currentUserId));

            return (
              <li key={review.id}>
                <article>
                  <h3>
                    {review.policyNameSnapshot} · level{" "}
                    {review.levelSnapshot}
                  </h3>
                  <p>
                    Status: <strong>{review.status}</strong>
                    {review.decisionOverdueAt
                      ? " · decision overdue"
                      : ""}
                  </p>
                  <p>
                    Filed {review.filedAt.toISOString()}
                    {review.filingDeadlineAt
                      ? ` · filing deadline ${review.filingDeadlineAt.toISOString()}`
                      : ""}
                  </p>
                  <p>
                    Decision due:{" "}
                    {review.decisionDueAt?.toISOString() ??
                      "not configured"}
                    {review.decisionWarningAt
                      ? ` · warning ${review.decisionWarningAt.toISOString()}`
                      : ""}
                  </p>
                  <p>
                    Reviewer:{" "}
                    {reviewer
                      ? reviewer.displayName ?? reviewer.email
                      : "unassigned"}
                  </p>
                  <p>
                    <strong>Grounds:</strong> {review.grounds}
                  </p>
                  {review.requestedRelief ? (
                    <p>
                      <strong>Requested relief:</strong>{" "}
                      {review.requestedRelief}
                    </p>
                  ) : null}
                  {review.parentReviewId ? (
                    <p>
                      Parent review:{" "}
                      <code>{review.parentReviewId}</code>
                    </p>
                  ) : null}

                  <details>
                    <summary>Challenged decision snapshot</summary>
                    <pre>
                      {JSON.stringify(
                        review.challengedSnapshot,
                        null,
                        2,
                      )}
                    </pre>
                  </details>

                  <details>
                    <summary>Filed policy snapshot</summary>
                    <pre>
                      {JSON.stringify(
                        review.policySnapshot,
                        null,
                        2,
                      )}
                    </pre>
                  </details>

                  {review.outcome ? (
                    <section>
                      <h4>Decision</h4>
                      <p>
                        Outcome: <strong>{review.outcome}</strong>
                      </p>
                      <p>{review.writtenDecision}</p>
                      {review.remandInstructions ? (
                        <p>
                          <strong>Instructions:</strong>{" "}
                          {review.remandInstructions}
                        </p>
                      ) : null}
                      <p>
                        Decided:{" "}
                        {review.decidedAt?.toISOString() ??
                          "—"}
                      </p>
                    </section>
                  ) : null}

                  {review.caseEffectAppliedAt ? (
                    <p>
                      Case effect applied{" "}
                      {review.caseEffectAppliedAt.toISOString()}
                      {" → "}
                      {review.caseEffectTargetStatus}
                    </p>
                  ) : null}

                  {canAssign && isOpen ? (
                    <form
                      action={assignReviewAction.bind(
                        null,
                        caseId,
                        review.id,
                      )}
                    >
                      <label>
                        Reviewer
                        <select
                          name="reviewerMembershipId"
                          defaultValue={
                            review.reviewerMembershipId ?? ""
                          }
                          required
                        >
                          <option value="">Select reviewer</option>
                          {eligibleReviewers.map((member) => (
                            <option
                              key={member.membershipId}
                              value={member.membershipId}
                            >
                              {member.displayName ??
                                member.email}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button type="submit">
                        {review.reviewerMembershipId
                          ? "Reassign review"
                          : "Assign review"}
                      </button>
                    </form>
                  ) : null}

                  {canDecide &&
                  isAssignedReviewer &&
                  review.status === "assigned" ? (
                    <form
                      action={beginReviewAction.bind(
                        null,
                        caseId,
                        review.id,
                      )}
                    >
                      <button type="submit">
                        Begin review
                      </button>
                    </form>
                  ) : null}

                  {canDecide &&
                  isAssignedReviewer &&
                  (review.status === "assigned" ||
                    review.status === "under_review") ? (
                    <details>
                      <summary>Enter written decision</summary>
                      <form
                        action={decideReviewAction.bind(
                          null,
                          caseId,
                          review.id,
                        )}
                      >
                        <label>
                          Outcome
                          <select name="outcome" required>
                            {policySnapshot.allowedOutcomes.map(
                              (outcome) => (
                                <option
                                  key={outcome}
                                  value={outcome}
                                >
                                  {outcome}
                                </option>
                              ),
                            )}
                          </select>
                        </label>
                        <label>
                          Written decision
                          <textarea
                            name="writtenDecision"
                            rows={8}
                            required
                          />
                        </label>
                        <label>
                          Remand / implementation instructions
                          <textarea
                            name="remandInstructions"
                            rows={4}
                          />
                        </label>
                        <button type="submit">
                          Issue decision
                        </button>
                      </form>
                    </details>
                  ) : null}

                  {canWithdraw ? (
                    <form
                      action={withdrawReviewAction.bind(
                        null,
                        caseId,
                        review.id,
                      )}
                    >
                      <button type="submit">
                        Withdraw review
                      </button>
                    </form>
                  ) : null}

                  {canApplyCaseEffect &&
                  review.status === "decided" &&
                  !review.caseEffectAppliedAt ? (
                    <details>
                      <summary>
                        Apply decision to case workflow
                      </summary>
                      <p>
                        This is an explicit reopen/remand-style
                        operation. It does not rewrite the original
                        challenged decision.
                      </p>
                      <form
                        action={applyReviewDecisionAction.bind(
                          null,
                          caseId,
                          review.id,
                        )}
                      >
                        <label>
                          Target workflow state
                          <select
                            name="targetStatus"
                            required
                          >
                            <option value="">
                              Select target state
                            </option>
                            {workflowStates
                              .filter(
                                (state) =>
                                  state.key !==
                                  currentCaseStatus,
                              )
                              .map((state) => (
                                <option
                                  key={state.key}
                                  value={state.key}
                                >
                                  {state.label} ({state.key})
                                </option>
                              ))}
                          </select>
                        </label>
                        <button type="submit">
                          Apply and reopen case
                        </button>
                      </form>
                    </details>
                  ) : null}

                  <details>
                    <summary>Review history</summary>
                    {reviewHistory.length === 0 ? (
                      <p>No history entries.</p>
                    ) : (
                      <ol>
                        {reviewHistory.map((entry) => (
                          <li key={entry.id}>
                            {entry.occurredAt.toISOString()}
                            {" — "}
                            {entry.eventType}
                            {entry.fromStatus ||
                            entry.toStatus
                              ? ` (${entry.fromStatus ?? "—"} → ${entry.toStatus ?? "—"})`
                              : ""}
                          </li>
                        ))}
                      </ol>
                    )}
                  </details>
                </article>
              </li>
            );
          })}
        </ol>
      )}

      {canFile ? (
        <details>
          <summary>File a review request</summary>
          {activePolicies.length === 0 ? (
            <p>
              No active review policies are configured.
            </p>
          ) : (
            <form
              action={fileCaseReviewAction.bind(
                null,
                caseId,
              )}
            >
              <label>
                Review policy
                <select name="policyId" required>
                  <option value="">Select policy</option>
                  {activePolicies.map((policy) => (
                    <option
                      key={policy.id}
                      value={policy.id}
                    >
                      Level {policy.level}: {policy.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Parent decided review (only when required)
                <select
                  name="parentReviewId"
                  defaultValue=""
                >
                  <option value="">
                    Challenge current case decision
                  </option>
                  {decidedReviews.map((review) => (
                    <option
                      key={review.id}
                      value={review.id}
                    >
                      {review.policyNameSnapshot} —{" "}
                      {review.outcome}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Grounds
                <textarea
                  name="grounds"
                  rows={6}
                  required
                />
              </label>
              <label>
                Requested relief
                <textarea
                  name="requestedRelief"
                  rows={4}
                />
              </label>
              <button type="submit">
                File review request
              </button>
            </form>
          )}
        </details>
      ) : null}
    </section>
  );
}
