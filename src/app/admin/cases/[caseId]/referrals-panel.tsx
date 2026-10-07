import type { listCaseDeadlines } from "@/modules/deadlines/repository";
import type {
  listCaseReferrals,
  listReferralEvents,
  listReferralPolicies,
} from "@/modules/referrals/repository";
import {
  acknowledgeReferralAction,
  createReferralAction,
  extendDeadlineAction,
  finalizeReferralAction,
  recordReferralResponseAction,
  sendReferralAction,
} from "./actions";

type Referrals = Awaited<ReturnType<typeof listCaseReferrals>>;
type ReferralPolicies = Awaited<
  ReturnType<typeof listReferralPolicies>
>;
type ReferralEvents = Awaited<
  ReturnType<typeof listReferralEvents>
>;
type Deadlines = Awaited<ReturnType<typeof listCaseDeadlines>>;

export function CaseReferralsPanel({
  caseId,
  referrals,
  policies,
  eventsByReferral,
  deadlinesByReferral,
  canManage,
  canOperateDeadlines,
}: {
  caseId: string;
  referrals: Referrals;
  policies: ReferralPolicies;
  eventsByReferral: Map<string, ReferralEvents>;
  deadlinesByReferral: Map<string, Deadlines>;
  canManage: boolean;
  canOperateDeadlines: boolean;
}) {
  return (
    <section>
      <h2>Referrals</h2>
      <p>
        Referrals are tracked independently. Each recipient has its own
        event history and deadline clocks.
      </p>

      {canManage ? (
        <details>
          <summary>Create referral</summary>
          <form action={createReferralAction.bind(null, caseId)}>
            <label>
              Policy
              <select name="policyKey" required defaultValue="">
                <option value="" disabled>
                  Select a referral policy
                </option>
                {policies.map((policy) => (
                  <option key={policy.id} value={policy.key}>
                    {policy.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Recipient name
              <input name="recipientName" required maxLength={500} />
            </label>
            <label>
              Recipient key/code
              <input name="recipientKey" maxLength={200} />
            </label>
            <label>
              External reference
              <input name="externalReference" maxLength={500} />
            </label>
            <label>
              Subject
              <input name="subject" maxLength={1000} />
            </label>
            <label>
              Summary
              <textarea name="summary" maxLength={10000} />
            </label>
            <button type="submit">Create referral</button>
          </form>
        </details>
      ) : null}

      {referrals.length === 0 ? (
        <p>No referrals have been created for this case.</p>
      ) : (
        referrals.map(({ referral, policy }) => {
          const events = eventsByReferral.get(referral.id) ?? [];
          const deadlines =
            deadlinesByReferral.get(referral.id) ?? [];
          const final =
            referral.status === "completed" ||
            referral.status === "cancelled";

          return (
            <article key={referral.id}>
              <h3>
                {referral.recipientName} — {referral.status}
              </h3>
              <dl>
                <dt>Policy</dt>
                <dd>
                  {policy.name} (<code>{referral.policyKey}</code>)
                </dd>
                <dt>Recipient key</dt>
                <dd>{referral.recipientKey ?? "—"}</dd>
                <dt>External reference</dt>
                <dd>{referral.externalReference ?? "—"}</dd>
                <dt>Subject</dt>
                <dd>{referral.subject ?? "—"}</dd>
                <dt>Sent</dt>
                <dd>{referral.sentAt?.toISOString() ?? "—"}</dd>
                <dt>Acknowledged</dt>
                <dd>
                  {referral.acknowledgedAt?.toISOString() ?? "—"}
                </dd>
                <dt>Completed</dt>
                <dd>{referral.completedAt?.toISOString() ?? "—"}</dd>
              </dl>
              {referral.summary ? <p>{referral.summary}</p> : null}

              <h4>Referral deadlines</h4>
              {deadlines.length === 0 ? (
                <p>No referral deadlines have started.</p>
              ) : (
                deadlines.map((deadline) => (
                  <div key={deadline.id}>
                    <p>
                      <strong>{deadline.label}</strong> —{" "}
                      {deadline.status}; due{" "}
                      {deadline.dueAt.toISOString()}
                    </p>
                    {canOperateDeadlines &&
                    !["completed", "cancelled"].includes(
                      deadline.status,
                    ) ? (
                      <form
                        action={extendDeadlineAction.bind(
                          null,
                          caseId,
                          deadline.id,
                        )}
                      >
                        <label>
                          Extension
                          <input
                            name="extensionValue"
                            type="number"
                            min={1}
                            step={1}
                            required
                          />
                        </label>
                        <label>
                          Unit
                          <select
                            name="extensionUnit"
                            defaultValue="calendar_days"
                          >
                            <option value="hours">Hours</option>
                            <option value="calendar_days">
                              Calendar days
                            </option>
                            <option value="business_days">
                              Business days
                            </option>
                          </select>
                        </label>
                        <label>
                          Reason
                          <input
                            name="reason"
                            required
                            maxLength={2000}
                          />
                        </label>
                        <button type="submit">
                          Record extension
                        </button>
                      </form>
                    ) : null}
                  </div>
                ))
              )}

              <h4>Referral history</h4>
              {events.length === 0 ? (
                <p>No referral events recorded.</p>
              ) : (
                <ol>
                  {events.map((event) => (
                    <li key={event.id}>
                      <strong>{event.eventType}</strong>{" "}
                      {event.occurredAt.toISOString()}
                      {event.summary ? " — " + event.summary : ""}
                    </li>
                  ))}
                </ol>
              )}

              {canManage && referral.status === "draft" ? (
                <form
                  action={sendReferralAction.bind(
                    null,
                    caseId,
                    referral.id,
                  )}
                >
                  <label>
                    Send note
                    <input name="note" maxLength={10000} />
                  </label>
                  <button type="submit">Mark referral sent</button>
                </form>
              ) : null}

              {canManage && !final && referral.status !== "draft" ? (
                <>
                  {!referral.acknowledgedAt ? (
                    <form
                      action={acknowledgeReferralAction.bind(
                        null,
                        caseId,
                        referral.id,
                      )}
                    >
                      <label>
                        Acknowledgment summary
                        <input name="summary" maxLength={10000} />
                      </label>
                      <label>
                        External reference
                        <input
                          name="externalReference"
                          maxLength={500}
                        />
                      </label>
                      <button type="submit">
                        Record acknowledgment
                      </button>
                    </form>
                  ) : null}

                  <form
                    action={recordReferralResponseAction.bind(
                      null,
                      caseId,
                      referral.id,
                    )}
                  >
                    <label>
                      Response type
                      <select
                        name="responseType"
                        defaultValue="status_update"
                      >
                        <option value="preliminary_response">
                          Preliminary response
                        </option>
                        <option value="status_update">
                          Status update
                        </option>
                        <option value="final_response">
                          Final response
                        </option>
                      </select>
                    </label>
                    <label>
                      Response summary
                      <textarea
                        name="summary"
                        required
                        maxLength={10000}
                      />
                    </label>
                    <button type="submit">Record response</button>
                  </form>

                  <form
                    action={finalizeReferralAction.bind(
                      null,
                      caseId,
                      referral.id,
                    )}
                  >
                    <label>
                      Final action
                      <select name="operation" defaultValue="complete">
                        <option value="complete">Complete</option>
                        <option value="cancel">Cancel</option>
                      </select>
                    </label>
                    <label>
                      Reason
                      <input name="reason" required maxLength={10000} />
                    </label>
                    <button type="submit">
                      Finalize referral
                    </button>
                  </form>
                </>
              ) : null}
            </article>
          );
        })
      )}
    </section>
  );
}
