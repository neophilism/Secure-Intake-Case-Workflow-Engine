import Link from "next/link";
import { redirect } from "next/navigation";
import { getRuntimeDatabase } from "@/db/runtime";
import {
  hasPermission,
  requireTenantScope,
} from "@/modules/auth/authorization";
import { getCurrentAuthorizationContext } from "@/modules/auth/server-session";
import {
  getDisclosureOrganization,
  listDisclosurePublicationDocuments,
  listDisclosurePublications,
  listDisclosurePublicationVersions,
  listDocumentDerivatives,
} from "@/modules/disclosures/repository";
import {
  attachDerivativeAction,
  createDisclosurePublicationAction,
  createDisclosureRevisionAction,
  createRedactedDerivativeAction,
  detachDerivativeAction,
  publishDisclosureVersionAction,
  recordDerivativeScanAction,
  reviewDisclosureVersionAction,
  submitDisclosureVersionAction,
  withdrawDisclosurePublicationAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function DisclosuresPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const context = await getCurrentAuthorizationContext();
  if (!context) redirect("/login");
  if (!context.tenantScope) redirect("/select-organization");
  if (!hasPermission(context, "disclosure:view")) {
    redirect("/forbidden");
  }

  const db = getRuntimeDatabase();
  const scope = requireTenantScope(context);
  const { error } = await searchParams;

  const [
    organization,
    publications,
    versions,
    derivatives,
    publicationDocuments,
  ] = await Promise.all([
    getDisclosureOrganization(db, scope),
    listDisclosurePublications(db, scope),
    listDisclosurePublicationVersions(db, scope),
    listDocumentDerivatives(db, scope),
    listDisclosurePublicationDocuments(db, scope),
  ]);

  const canPrepare = hasPermission(
    context,
    "disclosure:prepare",
  );
  const canReview = hasPermission(
    context,
    "disclosure:review",
  );
  const canPublish = hasPermission(
    context,
    "disclosure:publish",
  );
  const canScan = hasPermission(
    context,
    "document:scan_manage",
  );

  const versionsByPublication = new Map<
    string,
    typeof versions
  >();
  for (const version of versions) {
    const current =
      versionsByPublication.get(version.publicationId) ?? [];
    current.push(version);
    versionsByPublication.set(
      version.publicationId,
      current,
    );
  }

  const documentsByVersion = new Map<
    string,
    typeof publicationDocuments
  >();
  for (const row of publicationDocuments) {
    const current =
      documentsByVersion.get(
        row.link.publicationVersionId,
      ) ?? [];
    current.push(row);
    documentsByVersion.set(
      row.link.publicationVersionId,
      current,
    );
  }

  const publicDerivatives = derivatives.filter(
    ({ derivative }) => derivative.audience === "public",
  );

  return (
    <main>
      <nav>
        <Link href="/admin/cases">Cases</Link>
        {" · "}
        <Link href="/admin/documents">Documents</Link>
        {" · "}
        <Link href="/admin/reviews">Reviews</Link>
        {" · "}
        <Link href="/admin/disclosures">Disclosures</Link>
        {" · "}
        <Link href="/admin/audit">Audit</Link>
      </nav>

      <h1>Disclosure & redaction</h1>
      <p>
        Public classification does not publish a source record.
        Anonymous disclosure occurs only through an independently
        reviewed publication version on this screen.
      </p>

      {error ? (
        <p role="alert">
          The requested disclosure operation failed ({error}).
        </p>
      ) : null}

      <section>
        <h2>Publications</h2>
        {publications.length === 0 ? (
          <p>No disclosure publications have been prepared.</p>
        ) : (
          publications.map((publication) => {
            const publicationVersions =
              versionsByPublication.get(publication.id) ?? [];
            const latest = publicationVersions[0] ?? null;

            return (
              <article key={publication.id}>
                <h3>
                  {publication.sourceType}:{" "}
                  <code>{publication.sourceId}</code>
                </h3>
                <p>
                  Slug: <code>{publication.slug}</code> ·
                  publication status:{" "}
                  <strong>{publication.status}</strong>
                </p>

                {publication.status === "published" &&
                organization ? (
                  <p>
                    <Link
                      href={`/public/disclosures/${organization.slug}/${publication.slug}`}
                    >
                      Open public release
                    </Link>
                  </p>
                ) : null}

                {publicationVersions.map((version) => {
                  const attached =
                    documentsByVersion.get(version.id) ?? [];

                  return (
                    <details
                      key={version.id}
                      open={
                        version.status === "draft" ||
                        version.status === "submitted"
                      }
                    >
                      <summary>
                        Version {version.versionNumber} —{" "}
                        {version.status}
                      </summary>
                      <p>
                        Public title:{" "}
                        <strong>{version.publicTitle}</strong>
                      </p>
                      {version.publicSummary ? (
                        <p>{version.publicSummary}</p>
                      ) : null}
                      <p>
                        Prepared by:{" "}
                        {version.preparedByUserId ?? "system"}
                      </p>
                      <p>
                        Submitted:{" "}
                        {version.submittedAt?.toISOString() ??
                          "—"}{" "}
                        · Approved:{" "}
                        {version.approvedAt?.toISOString() ??
                          "—"}{" "}
                        · Published:{" "}
                        {version.publishedAt?.toISOString() ??
                          "—"}
                      </p>

                      <details>
                        <summary>
                          Public representation JSON
                        </summary>
                        <pre>
                          {JSON.stringify(
                            version.publicData,
                            null,
                            2,
                          )}
                        </pre>
                      </details>

                      {version.redactionSummary ? (
                        <p>
                          <strong>
                            Internal redaction summary:
                          </strong>{" "}
                          {version.redactionSummary}
                        </p>
                      ) : null}

                      {version.reviewNote ? (
                        <p>
                          <strong>Review note:</strong>{" "}
                          {version.reviewNote}
                        </p>
                      ) : null}

                      <h4>Attached public derivatives</h4>
                      {attached.length === 0 ? (
                        <p>No public documents attached.</p>
                      ) : (
                        <ul>
                          {attached.map(
                            ({
                              link,
                              derivative,
                              document,
                              version: documentVersion,
                            }) => (
                              <li key={link.id}>
                                {link.label ??
                                  document.title}{" "}
                                —{" "}
                                {
                                  documentVersion.malwareScanStatus
                                }
                                /{documentVersion.contentStatus}
                                {canPrepare &&
                                version.status === "draft" ? (
                                  <form
                                    action={detachDerivativeAction.bind(
                                      null,
                                      version.id,
                                      derivative.id,
                                    )}
                                  >
                                    <button type="submit">
                                      Detach
                                    </button>
                                  </form>
                                ) : null}
                              </li>
                            ),
                          )}
                        </ul>
                      )}

                      {canPrepare &&
                      version.status === "draft" ? (
                        <>
                          <form
                            action={attachDerivativeAction.bind(
                              null,
                              version.id,
                            )}
                          >
                            <label>
                              Attach public derivative
                              <select
                                name="documentDerivativeId"
                                required
                                defaultValue=""
                              >
                                <option value="">
                                  Select derivative
                                </option>
                                {publicDerivatives.map(
                                  ({
                                    derivative,
                                    derivedDocument,
                                    derivedVersion,
                                  }) => (
                                    <option
                                      key={derivative.id}
                                      value={derivative.id}
                                    >
                                      {derivedDocument.title} —{" "}
                                      {
                                        derivedVersion.malwareScanStatus
                                      }
                                      /
                                      {
                                        derivedVersion.contentStatus
                                      }
                                    </option>
                                  ),
                                )}
                              </select>
                            </label>
                            <label>
                              Public label
                              <input name="label" />
                            </label>
                            <label>
                              Order
                              <input
                                name="sortOrder"
                                type="number"
                                min={0}
                                defaultValue={0}
                              />
                            </label>
                            <button type="submit">
                              Attach derivative
                            </button>
                          </form>

                          <form
                            action={submitDisclosureVersionAction.bind(
                              null,
                              version.id,
                            )}
                          >
                            <button type="submit">
                              Submit for disclosure review
                            </button>
                          </form>
                        </>
                      ) : null}

                      {canReview &&
                      version.status === "submitted" ? (
                        <section>
                          <h4>Disclosure review</h4>
                          <form
                            action={reviewDisclosureVersionAction.bind(
                              null,
                              version.id,
                              "approved",
                            )}
                          >
                            <label>
                              Review note
                              <textarea
                                name="reviewNote"
                                rows={3}
                              />
                            </label>
                            <button type="submit">
                              Approve
                            </button>
                          </form>
                          <form
                            action={reviewDisclosureVersionAction.bind(
                              null,
                              version.id,
                              "rejected",
                            )}
                          >
                            <label>
                              Rejection note
                              <textarea
                                name="reviewNote"
                                rows={3}
                              />
                            </label>
                            <button type="submit">
                              Reject
                            </button>
                          </form>
                        </section>
                      ) : null}

                      {canPublish &&
                      version.status === "approved" ? (
                        <form
                          action={publishDisclosureVersionAction.bind(
                            null,
                            version.id,
                          )}
                        >
                          <button type="submit">
                            Publish approved version
                          </button>
                        </form>
                      ) : null}
                    </details>
                  );
                })}

                {canPrepare && latest ? (
                  <details>
                    <summary>Create new revision</summary>
                    <form
                      action={createDisclosureRevisionAction.bind(
                        null,
                        publication.id,
                      )}
                    >
                      <label>
                        Public title
                        <input
                          name="publicTitle"
                          defaultValue={latest.publicTitle}
                          required
                        />
                      </label>
                      <label>
                        Public summary
                        <textarea
                          name="publicSummary"
                          rows={3}
                          defaultValue={
                            latest.publicSummary ?? ""
                          }
                        />
                      </label>
                      <label>
                        Public data JSON
                        <textarea
                          name="publicData"
                          rows={10}
                          defaultValue={JSON.stringify(
                            latest.publicData,
                            null,
                            2,
                          )}
                        />
                      </label>
                      <label>
                        Internal redaction summary
                        <textarea
                          name="redactionSummary"
                          rows={4}
                        />
                      </label>
                      <button type="submit">
                        Create immutable revision
                      </button>
                    </form>
                  </details>
                ) : null}

                {canPublish &&
                publication.status === "published" ? (
                  <form
                    action={withdrawDisclosurePublicationAction.bind(
                      null,
                      publication.id,
                    )}
                  >
                    <label>
                      Withdrawal reason
                      <input name="reason" required />
                    </label>
                    <button type="submit">
                      Withdraw public release
                    </button>
                  </form>
                ) : null}
              </article>
            );
          })
        )}
      </section>

      {canPrepare ? (
        <section>
          <h2>Prepare new publication</h2>
          <form action={createDisclosurePublicationAction}>
            <label>
              Source type
              <select name="sourceType" required>
                <option value="case">case</option>
                <option value="submission">submission</option>
                <option value="document">document</option>
                <option value="note">note</option>
                <option value="correspondence">
                  correspondence
                </option>
                <option value="review">review</option>
              </select>
            </label>
            <label>
              Source UUID
              <input name="sourceId" required />
            </label>
            <label>
              Public slug
              <input
                name="slug"
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                required
              />
            </label>
            <label>
              Public title
              <input name="publicTitle" required />
            </label>
            <label>
              Public summary
              <textarea name="publicSummary" rows={3} />
            </label>
            <label>
              Public-safe JSON representation
              <textarea
                name="publicData"
                rows={10}
                defaultValue={"{}"}
              />
            </label>
            <label>
              Internal redaction summary
              <textarea
                name="redactionSummary"
                rows={4}
              />
            </label>
            <button type="submit">
              Create disclosure draft
            </button>
          </form>
        </section>
      ) : null}

      <section>
        <h2>Redacted document derivatives</h2>
        {derivatives.length === 0 ? (
          <p>No redacted derivatives have been created.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Derivative</th>
                <th>Source version</th>
                <th>Audience</th>
                <th>Scan/content</th>
                <th>Hash</th>
                {canScan ? <th>Scanner result</th> : null}
              </tr>
            </thead>
            <tbody>
              {derivatives.map(
                ({
                  derivative,
                  derivedDocument,
                  derivedVersion,
                }) => (
                  <tr key={derivative.id}>
                    <td>
                      {derivedDocument.title}
                      <br />
                      <code>{derivative.id}</code>
                    </td>
                    <td>
                      <code>
                        {derivative.sourceDocumentVersionId}
                      </code>
                    </td>
                    <td>{derivative.audience}</td>
                    <td>
                      {derivedVersion.malwareScanStatus}/
                      {derivedVersion.contentStatus}
                    </td>
                    <td>
                      <code>{derivedVersion.sha256}</code>
                    </td>
                    {canScan ? (
                      <td>
                        <form
                          action={recordDerivativeScanAction.bind(
                            null,
                            derivedVersion.id,
                          )}
                        >
                          <select
                            name="status"
                            defaultValue="clean"
                          >
                            <option value="clean">
                              clean
                            </option>
                            <option value="infected">
                              infected
                            </option>
                            <option value="failed">
                              failed
                            </option>
                          </select>
                          <input
                            name="provider"
                            defaultValue="manual-record"
                            required
                          />
                          <button type="submit">
                            Record
                          </button>
                        </form>
                      </td>
                    ) : null}
                  </tr>
                ),
              )}
            </tbody>
          </table>
        )}

        {canPrepare ? (
          <details>
            <summary>Create redacted derivative</summary>
            <p>
              Create the redacted file outside the engine, then
              upload that exact derivative here. The source
              document remains unchanged.
            </p>
            <form action={createRedactedDerivativeAction}>
              <label>
                Source document version UUID
                <input
                  name="sourceDocumentVersionId"
                  required
                />
              </label>
              <label>
                Audience
                <select
                  name="audience"
                  defaultValue="public"
                >
                  <option value="public">public</option>
                  <option value="participant">
                    participant
                  </option>
                </select>
              </label>
              <label>
                Derivative title
                <input name="title" required />
              </label>
              <label>
                Description
                <textarea name="description" rows={3} />
              </label>
              <label>
                Redaction summary
                <textarea
                  name="redactionSummary"
                  rows={4}
                />
              </label>
              <label>
                Redacted file
                <input name="file" type="file" required />
              </label>
              <button type="submit">
                Create quarantined derivative
              </button>
            </form>
          </details>
        ) : null}
      </section>
    </main>
  );
}
