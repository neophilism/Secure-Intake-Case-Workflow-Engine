import {
  decideProtectedRevealAction,
  requestProtectedRevealAction,
} from "./actions";

interface ProtectedCompartmentView {
  id: string;
  compartmentKey: string;
  fieldIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

interface ProtectedRevealRequestView {
  id: string;
  compartmentId: string;
  requestedByUserId: string;
  reason: string;
  status: string;
  decidedByUserId: string | null;
  decisionReason: string | null;
  decidedAt: Date | null;
  expiresAt: Date | null;
  consumedAt: Date | null;
  createdAt: Date;
}

export function CaseProtectedDataPanel({
  caseId,
  compartments,
  requests,
  currentUserId,
  canRequest,
  canApprove,
}: {
  caseId: string;
  compartments: ProtectedCompartmentView[];
  requests: ProtectedRevealRequestView[];
  currentUserId: string;
  canRequest: boolean;
  canApprove: boolean;
}) {
  const now = Date.now();

  return (
    <section>
      <h2>Protected data</h2>
      <p>
        Protected values are stored separately from ordinary submission
        answers. Values are not displayed on this page.
      </p>

      {compartments.length === 0 ? (
        <p>No protected compartments are attached to this submission.</p>
      ) : (
        compartments.map((compartment) => {
          const compartmentRequests = requests.filter(
            (request) => request.compartmentId === compartment.id,
          );

          return (
            <article key={compartment.id}>
              <h3>
                <code>{compartment.compartmentKey}</code>
              </h3>
              <dl>
                <dt>Protected fields</dt>
                <dd>{compartment.fieldIds.join(", ") || "—"}</dd>
                <dt>Updated</dt>
                <dd>{compartment.updatedAt.toISOString()}</dd>
              </dl>

              {canRequest ? (
                <form
                  action={requestProtectedRevealAction.bind(
                    null,
                    caseId,
                    compartment.id,
                  )}
                >
                  <label>
                    Reason for access
                    <input
                      name="reason"
                      required
                      maxLength={5000}
                      autoComplete="off"
                    />
                  </label>
                  <button type="submit">Request protected-data reveal</button>
                </form>
              ) : null}

              {compartmentRequests.length > 0 ? (
                <details>
                  <summary>
                    Reveal requests ({compartmentRequests.length})
                  </summary>
                  <ol>
                    {compartmentRequests.map((request) => {
                      const approvedForCurrentUser =
                        request.status === "approved" &&
                        request.requestedByUserId === currentUserId &&
                        request.expiresAt !== null &&
                        request.expiresAt.getTime() > now &&
                        request.consumedAt === null;
                      const canDecideThis =
                        canApprove &&
                        request.status === "pending" &&
                        request.requestedByUserId !== currentUserId;

                      return (
                        <li key={request.id}>
                          <p>
                            <strong>{request.status}</strong> · requested{" "}
                            {request.createdAt.toISOString()}
                          </p>
                          <p>Reason: {request.reason}</p>
                          {request.decisionReason ? (
                            <p>
                              Decision note: {request.decisionReason}
                            </p>
                          ) : null}
                          {request.expiresAt ? (
                            <p>
                              Reveal expires:{" "}
                              {request.expiresAt.toISOString()}
                            </p>
                          ) : null}

                          {canDecideThis ? (
                            <>
                              <form
                                action={decideProtectedRevealAction.bind(
                                  null,
                                  caseId,
                                  request.id,
                                  "approved",
                                )}
                              >
                                <label>
                                  Approval note
                                  <input
                                    name="decisionReason"
                                    maxLength={5000}
                                    autoComplete="off"
                                  />
                                </label>
                                <button type="submit">Approve reveal</button>
                              </form>
                              <form
                                action={decideProtectedRevealAction.bind(
                                  null,
                                  caseId,
                                  request.id,
                                  "rejected",
                                )}
                              >
                                <label>
                                  Rejection note
                                  <input
                                    name="decisionReason"
                                    maxLength={5000}
                                    autoComplete="off"
                                  />
                                </label>
                                <button type="submit">Reject reveal</button>
                              </form>
                            </>
                          ) : null}

                          {approvedForCurrentUser ? (
                            <form
                              method="post"
                              action={`/admin/protected/reveal/${request.id}`}
                              target="_blank"
                            >
                              <button type="submit">
                                Reveal once in a new tab
                              </button>
                            </form>
                          ) : null}
                        </li>
                      );
                    })}
                  </ol>
                </details>
              ) : null}
            </article>
          );
        })
      )}
    </section>
  );
}
