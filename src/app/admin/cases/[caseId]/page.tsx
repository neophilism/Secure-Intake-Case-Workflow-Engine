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
import { casePriorities } from "@/modules/cases/lifecycle";
import {
  listCaseAssignmentHistory,
  listOrganizationMembers,
  listQueues,
} from "@/modules/routing/repository";
import {
  findWorkflowState,
  parseWorkflowDefinition,
  transitionsFromState,
} from "@/modules/workflows/definition";
import {
  applyRoutingRulesAction,
  escalateCaseAction,
  manualAssignCaseAction,
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

  const [
    history,
    tags,
    source,
    queues,
    members,
    assignmentHistory,
  ] = await Promise.all([
    listCaseStatusHistory(db, scope, record.id),
    listCaseTags(db, scope, record.id),
    hasPermission(context, "submission:view")
      ? findCaseSourceSubmission(db, scope, record.id)
      : Promise.resolve(null),
    listQueues(db, scope),
    listOrganizationMembers(db, scope),
    listCaseAssignmentHistory(db, scope, record.id),
  ]);

  const workflow = parseWorkflowDefinition(record.workflowDefinition);
  const state = findWorkflowState(workflow, record.status);
  const canUpdate = hasPermission(context, "case:update");
  const canAssign = hasPermission(context, "case:assign");
  const canApplyRouting =
    canAssign && hasPermission(context, "routing:view");
  const transitions = transitionsFromState(
    workflow,
    record.status,
  ).filter((transition) =>
    transition.requiredPermissions.every((permission) =>
      context.permissions.has(permission),
    ),
  );

  const queueById = new Map(
    queues.map((queue) => [queue.id, queue]),
  );
  const memberById = new Map(
    members.map((member) => [member.membershipId, member]),
  );
  const currentQueue = record.assignedQueueId
    ? queueById.get(record.assignedQueueId)
    : null;
  const currentAssignee = record.assignedMembershipId
    ? memberById.get(record.assignedMembershipId)
    : null;

  const memberLabel = (membershipId: string | null) => {
    if (!membershipId) return "unassigned";
    const member = memberById.get(membershipId);
    return member
      ? member.displayName ?? member.email
      : membershipId;
  };

  const queueLabel = (queueId: string | null) => {
    if (!queueId) return "no queue";
    return queueById.get(queueId)?.name ?? queueId;
  };

  return (
    <main>
      <nav>
        <Link href="/admin/cases">← Cases</Link>
        {" · "}
        <Link href="/admin/workflows">Workflows</Link>
        {" · "}
        <Link href="/admin/routing">Routing</Link>
      </nav>

      <h1>
        {record.caseNumber}: {record.title}
      </h1>

      {error ? (
        <p role="alert">
          {error === "transition_requirements"
            ? "The workflow requirements for that transition were not satisfied."
            : error === "no_routing_match"
              ? "No active routing rule matched this case."
              : `The requested case operation could not be completed (${error}).`}
        </p>
      ) : null}

      <dl>
        <dt>Status</dt>
        <dd>{state?.label ?? record.status}</dd>
        <dt>Workflow</dt>
        <dd>
          {record.workflowVersionId
            ? "Pinned published workflow version"
            : "Built-in default workflow snapshot"}
        </dd>
        <dt>Type</dt>
        <dd>{record.caseType}</dd>
        <dt>Priority</dt>
        <dd>{record.priority}</dd>
        <dt>Queue</dt>
        <dd>{currentQueue?.name ?? "Unassigned"}</dd>
        <dt>Assignee</dt>
        <dd>
          {currentAssignee
            ? currentAssignee.displayName ?? currentAssignee.email
            : "Unassigned"}
        </dd>
        <dt>Assigned</dt>
        <dd>{record.assignedAt?.toISOString() ?? "—"}</dd>
        <dt>Escalation level</dt>
        <dd>{record.escalationLevel}</dd>
        <dt>Last escalated</dt>
        <dd>{record.escalatedAt?.toISOString() ?? "—"}</dd>
        <dt>Escalation reason</dt>
        <dd>{record.escalationReason ?? "—"}</dd>
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

      {canAssign ? (
        <section>
          <h2>Assignment</h2>

          <form action={manualAssignCaseAction.bind(null, record.id)}>
            <label>
              Queue
              <select
                name="queueId"
                defaultValue={record.assignedQueueId ?? ""}
              >
                <option value="">No queue</option>
                {queues
                  .filter((queue) => queue.status === "active")
                  .map((queue) => (
                    <option key={queue.id} value={queue.id}>
                      {queue.name} ({queue.assignmentStrategy})
                    </option>
                  ))}
              </select>
            </label>

            <label>
              Assignee
              <select
                name="membershipId"
                defaultValue={record.assignedMembershipId ?? ""}
              >
                <option value="">Unassigned</option>
                {members.map((member) => (
                  <option
                    key={member.membershipId}
                    value={member.membershipId}
                  >
                    {member.displayName ?? member.email}
                    {member.title ? ` — ${member.title}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Reason
              <input name="reason" />
            </label>

            <button type="submit">Save assignment</button>
          </form>

          {canApplyRouting ? (
            <form action={applyRoutingRulesAction.bind(null, record.id)}>
              <button type="submit">
                Apply routing rules now
              </button>
            </form>
          ) : null}

          <details>
            <summary>Escalate case</summary>
            <form action={escalateCaseAction.bind(null, record.id)}>
              <label>
                Escalation reason
                <textarea name="reason" rows={3} required />
              </label>

              <label>
                Escalation queue (optional)
                <select name="targetQueueId" defaultValue="">
                  <option value="">Keep current queue</option>
                  {queues
                    .filter((queue) => queue.status === "active")
                    .map((queue) => (
                      <option key={queue.id} value={queue.id}>
                        {queue.name}
                      </option>
                    ))}
                </select>
              </label>

              <label>
                Priority (optional)
                <select name="priority" defaultValue="">
                  <option value="">Keep current priority</option>
                  {casePriorities.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
                    </option>
                  ))}
                </select>
              </label>

              <button type="submit">Escalate</button>
            </form>
          </details>
        </section>
      ) : null}

      <section>
        <h2>Assignment history</h2>
        {assignmentHistory.length === 0 ? (
          <p>No assignment changes have been recorded.</p>
        ) : (
          <ol>
            {assignmentHistory.map((entry) => (
              <li key={entry.id}>
                {entry.createdAt.toISOString()}:{" "}
                {queueLabel(entry.fromQueueId)} /{" "}
                {memberLabel(entry.fromMembershipId)}
                {" → "}
                {queueLabel(entry.toQueueId)} /{" "}
                {memberLabel(entry.toMembershipId)}
                {" — "}
                {entry.source}
                {entry.reason ? ` — ${entry.reason}` : ""}
              </li>
            ))}
          </ol>
        )}
      </section>

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

      {transitions.length > 0 ? (
        <section>
          <h2>Workflow transition</h2>
          <form action={transitionCaseAction.bind(null, record.id)}>
            <label>
              Transition
              <select name="transitionKey" required defaultValue="">
                <option value="" disabled>
                  Select transition
                </option>
                {transitions.map((transition) => {
                  const target = findWorkflowState(
                    workflow,
                    transition.to,
                  );
                  return (
                    <option
                      key={transition.key}
                      value={transition.key}
                    >
                      {transition.label} →{" "}
                      {target?.label ?? transition.to}
                    </option>
                  );
                })}
              </select>
            </label>

            <label>
              Transition comment
              <textarea name="comment" rows={3} />
            </label>

            <label>
              Proposed disposition (optional)
              <input
                name="disposition"
                defaultValue={record.disposition ?? ""}
              />
            </label>

            <button type="submit">Apply transition</button>
          </form>

          <details>
            <summary>Transition requirements</summary>
            {transitions.map((transition) => (
              <article key={transition.key}>
                <h3>{transition.label}</h3>
                <p>
                  Comment: {transition.comment}. Required permissions:{" "}
                  {transition.requiredPermissions.join(", ")}.
                </p>
                {transition.guards.requiredCaseFields.length > 0 ? (
                  <p>
                    Required case fields:{" "}
                    {transition.guards.requiredCaseFields.join(", ")}.
                  </p>
                ) : null}
                {transition.guards.requiredSubmissionFields.length > 0 ? (
                  <p>
                    Required submission fields:{" "}
                    {transition.guards.requiredSubmissionFields.join(", ")}.
                  </p>
                ) : null}
                {transition.guards.requiredDocuments.length > 0 ? (
                  <p>
                    Required documents:{" "}
                    {transition.guards.requiredDocuments
                      .map(
                        (document) =>
                          `${document.type} × ${document.minCount}`,
                      )
                      .join(", ")}.
                  </p>
                ) : null}
              </article>
            ))}
          </details>
        </section>
      ) : null}

      <section>
        <h2>Status history</h2>
        <ol>
          {history.map((entry) => (
            <li key={entry.id}>
              {entry.createdAt.toISOString()}:{" "}
              {entry.fromStatus ?? "created"} → {entry.toStatus}
              {entry.transitionKey
                ? ` [${entry.transitionKey}]`
                : ""}
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
