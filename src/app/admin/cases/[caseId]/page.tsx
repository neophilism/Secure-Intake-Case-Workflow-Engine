import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getRuntimeDatabase } from "@/db/runtime";
import {
  hasPermission,
  requireTenantScope,
} from "@/modules/auth/authorization";
import { getCurrentAuthorizationContext } from "@/modules/auth/server-session";
import {
  findCaseById,
  findCaseSourceSubmission,
  listCaseStatusHistory,
  listCaseTags,
} from "@/modules/cases/repository";
import {
  allowedDefaultTransitions,
  casePriorities,
  isCaseStatus,
} from "@/modules/cases/lifecycle";
import {
  transitionCaseAction,
  updateCaseMetadataAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function CaseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ caseId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const context = await getCurrentAuthorizationContext();
  if (!context) redirect("/login");
  if (!context.tenantScope) redirect("/select-organization");
  if (!hasPermission(context, "case:view")) redirect("/forbidden");

  const { caseId } = await params;
  const { error } = await searchParams;
  const scope = requireTenantScope(context);
  const db = getRuntimeDatabase();

  const record = await findCaseById(db, scope, caseId);
  if (!record) notFound();

  const [history, tags, source] = await Promise.all([
    listCaseStatusHistory(db, scope, record.id),
    listCaseTags(db, scope, record.id),
    hasPermission(context, "submission:view")
      ? findCaseSourceSubmission(db, scope, record.id)
      : Promise.resolve(null),
  ]);

  const canUpdate = hasPermission(context, "case:update");
  const canClose = hasPermission(context, "case:close");
  const transitions = isCaseStatus(record.status)
    ? allowedDefaultTransitions(record.status).filter((status) =>
        status === "closed" ? canClose : canUpdate,
      )
    : [];
  const canTransition = transitions.length > 0;

  return (
    <main>
      <nav>
        <Link href="/admin/cases">← Cases</Link>
      </nav>

      <h1>
        {record.caseNumber}: {record.title}
      </h1>

      {error ? (
        <p role="alert">
          The requested case operation could not be completed ({error}).
        </p>
      ) : null}

      <dl>
        <dt>Status</dt>
        <dd>{record.status}</dd>
        <dt>Type</dt>
        <dd>{record.caseType}</dd>
        <dt>Priority</dt>
        <dd>{record.priority}</dd>
        <dt>Created</dt>
        <dd>{record.createdAt.toISOString()}</dd>
        <dt>Opened</dt>
        <dd>{record.openedAt?.toISOString() ?? "—"}</dd>
        <dt>Resolved</dt>
        <dd>{record.resolvedAt?.toISOString() ?? "—"}</dd>
        <dt>Closed</dt>
        <dd>{record.closedAt?.toISOString() ?? "—"}</dd>
        <dt>Disposition</dt>
        <dd>{record.disposition ?? "—"}</dd>
        <dt>Tags</dt>
        <dd>{tags.map((tag) => tag.tag).join(", ") || "—"}</dd>
      </dl>

      {record.summary ? (
        <section>
          <h2>Summary</h2>
          <p>{record.summary}</p>
        </section>
      ) : null}

      {canUpdate ? (
        <section>
          <h2>Case metadata</h2>
          <form action={updateCaseMetadataAction.bind(null, record.id)}>
            <label>
              Title
              <input name="title" required defaultValue={record.title} />
            </label>

            <label>
              Summary
              <textarea
                name="summary"
                rows={5}
                defaultValue={record.summary ?? ""}
              />
            </label>

            <label>
              Priority
              <select name="priority" defaultValue={record.priority}>
                {casePriorities.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Disposition
              <input
                name="disposition"
                defaultValue={record.disposition ?? ""}
              />
            </label>

            <label>
              Tags (comma-separated)
              <input
                name="tags"
                defaultValue={tags.map((tag) => tag.tag).join(", ")}
              />
            </label>

            <button type="submit">Save case metadata</button>
          </form>
        </section>
      ) : null}

      {canTransition ? (
        <section>
          <h2>Change status</h2>
          <form action={transitionCaseAction.bind(null, record.id)}>
            <label>
              Next status
              <select name="toStatus" required defaultValue="">
                <option value="" disabled>
                  Select transition
                </option>
                {transitions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Transition note
              <textarea name="note" rows={3} />
            </label>

            <label>
              Disposition (optional)
              <input
                name="disposition"
                defaultValue={record.disposition ?? ""}
              />
            </label>

            <button type="submit">Apply transition</button>
          </form>
        </section>
      ) : null}

      <section>
        <h2>Status history</h2>
        <ol>
          {history.map((entry) => (
            <li key={entry.id}>
              {entry.createdAt.toISOString()}:{" "}
              {entry.fromStatus ?? "created"} → {entry.toStatus}
              {entry.note ? ` — ${entry.note}` : ""}
            </li>
          ))}
        </ol>
      </section>

      {source ? (
        <section>
          <h2>Source intake</h2>
          <p>
            {source.formName} · version {source.formVersion} · submitted{" "}
            {source.submittedAt?.toISOString() ?? "unknown"}
          </p>
          <p>Confirmation: {source.confirmationCode ?? "—"}</p>
          <pre>{JSON.stringify(source.answers, null, 2)}</pre>
        </section>
      ) : record.sourceSubmissionId ? (
        <section>
          <h2>Source intake</h2>
          <p>
            Source submission details require the submission:view
            permission.
          </p>
        </section>
      ) : null}
    </main>
  );
}
