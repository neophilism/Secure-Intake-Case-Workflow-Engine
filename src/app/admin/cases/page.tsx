import Link from "next/link";
import { redirect } from "next/navigation";
import { getRuntimeDatabase } from "@/db/runtime";
import {
  hasPermission,
  requireTenantScope,
} from "@/modules/auth/authorization";
import { getCurrentAuthorizationContext } from "@/modules/auth/server-session";
import {
  listCases,
  listSubmittedIntakeAwaitingCase,
} from "@/modules/cases/repository";
import {
  listOrganizationMembers,
  listQueues,
} from "@/modules/routing/repository";
import { createCaseFromSubmissionAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const context = await getCurrentAuthorizationContext();
  if (!context) redirect("/login");
  if (!context.tenantScope) redirect("/select-organization");
  if (!hasPermission(context, "case:view")) redirect("/forbidden");

  const scope = requireTenantScope(context);
  const db = getRuntimeDatabase();
  const [records, queues, members] = await Promise.all([
    listCases(db, scope),
    listQueues(db, scope),
    listOrganizationMembers(db, scope),
  ]);
  const queueById = new Map(
    queues.map((queue) => [queue.id, queue]),
  );
  const memberById = new Map(
    members.map((member) => [member.membershipId, member]),
  );
  const canReviewIntake =
    hasPermission(context, "case:create") &&
    hasPermission(context, "submission:view");
  const queue = canReviewIntake
    ? await listSubmittedIntakeAwaitingCase(db, scope)
    : [];
  const { error } = await searchParams;

  return (
    <main>
      <nav>
        <Link href="/admin/organizations">Organization</Link>
        {" · "}
        <Link href="/admin/forms">Forms</Link>
        {" · "}
        <Link href="/admin/workflows">Workflows</Link>
        {" · "}
        <Link href="/admin/routing">Routing</Link>
        {" · "}
        <Link href="/admin/deadlines">Deadlines</Link>
        {" · "}
        <Link href="/admin/communications">Communications</Link>
        {" · "}
        <Link href="/notifications">Notifications</Link>
        {" · "}
        <Link href="/admin/jobs">Jobs</Link>
      </nav>

      <h1>Cases</h1>
      <p>
        Submitted intake can be converted into a case for review. Each case
        retains its source submission and status history.
      </p>

      {error ? (
        <p role="alert">
          The requested case operation could not be completed ({error}).
        </p>
      ) : null}

      {canReviewIntake ? (
        <section>
          <h2>Intake awaiting case creation</h2>
          {queue.length === 0 ? (
            <p>No submitted intake is waiting for review.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Submitted</th>
                  <th>Form</th>
                  <th>Confirmation</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((item) => (
                  <tr key={item.submissionId}>
                    <td>
                      {item.submittedAt
                        ? item.submittedAt.toISOString()
                        : "Unknown"}
                    </td>
                    <td>{item.formName}</td>
                    <td>{item.confirmationCode ?? "—"}</td>
                    <td>
                      <form action={createCaseFromSubmissionAction}>
                        <input
                          type="hidden"
                          name="submissionId"
                          value={item.submissionId}
                        />
                        <button type="submit">
                          Start intake review
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : null}

      <section>
        <h2>Case list</h2>
        {records.length === 0 ? (
          <p>No cases have been created.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Case</th>
                <th>Title</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Queue</th>
                <th>Assignee</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id}>
                  <td>
                    <Link href={`/admin/cases/${record.id}`}>
                      {record.caseNumber}
                    </Link>
                  </td>
                  <td>{record.title}</td>
                  <td>{record.status}</td>
                  <td>{record.priority}</td>
                  <td>
                    {record.assignedQueueId
                      ? queueById.get(record.assignedQueueId)?.name ??
                        record.assignedQueueId
                      : "—"}
                  </td>
                  <td>
                    {record.assignedMembershipId
                      ? memberById.get(record.assignedMembershipId)
                          ?.displayName ??
                        memberById.get(record.assignedMembershipId)
                          ?.email ??
                        record.assignedMembershipId
                      : "—"}
                  </td>
                  <td>{record.updatedAt.toISOString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
