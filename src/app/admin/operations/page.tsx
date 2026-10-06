import Link from "next/link";
import { redirect } from "next/navigation";
import { getRuntimeDatabase } from "@/db/runtime";
import {
  hasPermission,
  requireTenantScope,
} from "@/modules/auth/authorization";
import { getCurrentAuthorizationContext } from "@/modules/auth/server-session";
import { findApplicationProfile } from "@/modules/application/repository";
import { applicationTerm } from "@/modules/application/terminology";
import {
  caseSearchDefinitionFromSearchParams,
  caseSearchQueryString,
  operationalFocuses,
  parseCaseSearchDefinition,
  type CaseSearchDefinition,
} from "@/modules/operations/definition";
import {
  getOperationalDashboard,
  listMemberWorkload,
  listQueueWorkload,
  listSavedViews,
  searchCases,
} from "@/modules/operations/repository";
import {
  listOrganizationMembers,
  listQueues,
} from "@/modules/routing/repository";
import {
  deleteOperationalViewAction,
  saveOperationalViewAction,
  setDefaultOperationalViewAction,
} from "./actions";

export const dynamic = "force-dynamic";

function hrefFor(definition: CaseSearchDefinition) {
  const query = caseSearchQueryString(definition);
  return query ? `/admin/operations?${query}` : "/admin/operations";
}

function focusDefinition(
  focus: CaseSearchDefinition["focus"],
): CaseSearchDefinition {
  return parseCaseSearchDefinition({
    statuses: [],
    priorities: [],
    queueIds: [],
    assigneeMembershipIds: [],
    tags: [],
    focus,
    sort: "updated_desc",
    limit: 50,
  });
}

export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<
    Record<string, string | string[] | undefined>
  >;
}) {
  const context = await getCurrentAuthorizationContext();
  if (!context) redirect("/login");
  if (!context.tenantScope || !context.membership) {
    redirect("/select-organization");
  }
  if (!hasPermission(context, "case:view")) redirect("/forbidden");

  const params = await searchParams;
  let definition: CaseSearchDefinition;
  try {
    definition = caseSearchDefinitionFromSearchParams(params);
  } catch {
    redirect("/admin/operations?error=invalid_search");
  }

  const db = getRuntimeDatabase();
  const scope = requireTenantScope(context);
  const [
    dashboard,
    records,
    savedViews,
    queueWorkload,
    memberWorkload,
    queues,
    members,
    applicationProfile,
  ] = await Promise.all([
    getOperationalDashboard(db, scope, context.membership.id),
    searchCases(db, scope, definition, context.membership.id),
    listSavedViews(db, scope, context.membership.id),
    listQueueWorkload(db, scope),
    listMemberWorkload(db, scope),
    listQueues(db, scope),
    listOrganizationMembers(db, scope),
    findApplicationProfile(db, scope),
  ]);

  const caseSingular = applicationTerm(
    applicationProfile?.terminology,
    "case",
    1,
  );
  const casePlural = applicationTerm(
    applicationProfile?.terminology,
    "case",
    2,
  );
  const queueSingular = applicationTerm(
    applicationProfile?.terminology,
    "queue",
    1,
  );
  const queuePlural = applicationTerm(
    applicationProfile?.terminology,
    "queue",
    2,
  );
  const reviewSingular = applicationTerm(
    applicationProfile?.terminology,
    "review",
    1,
  );
  const reviewPlural = applicationTerm(
    applicationProfile?.terminology,
    "review",
    2,
  );
  const deadlinePlural = applicationTerm(
    applicationProfile?.terminology,
    "deadline",
    2,
  );

  const focusLabels: Record<
    (typeof operationalFocuses)[number],
    string
  > = {
    all: `All ${casePlural}`,
    open: "Open",
    mine: "Assigned to me",
    unassigned: "Unassigned",
    overdue: "Overdue",
    escalated: "Escalated",
    open_review: `Open ${reviewSingular}`,
    recently_closed: "Recently closed",
  };

  const error = Array.isArray(params.error)
    ? params.error[0]
    : params.error;
  const saved = Array.isArray(params.saved)
    ? params.saved[0]
    : params.saved;

  const cards = [
    ["open", "Open", dashboard.open],
    ["mine", "Assigned to me", dashboard.mine],
    ["unassigned", "Unassigned", dashboard.unassigned],
    ["overdue", "Overdue", dashboard.overdue],
    ["escalated", "Escalated", dashboard.escalated],
    ["open_review", "Open review", dashboard.openReview],
    [
      "recently_closed",
      "Closed in last 7 days",
      dashboard.recentlyClosed,
    ],
  ] as const;

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
        <Link href="/admin/cases">{casePlural}</Link>
        {" · "}
        <Link href="/admin/deadlines">{deadlinePlural}</Link>
        {" · "}
        <Link href="/admin/reviews">{reviewPlural}</Link>
        {" · "}
        <Link href="/admin/disclosures">Disclosures</Link>
        {" · "}
        <Link href="/notifications">Notifications</Link>
        {" · "}
        <Link href="/admin/integrations">Integrations</Link>
        {" · "}
        <Link href="/admin/application">Application</Link>
      </nav>

      <h1>Operations</h1>
      <p>
        Tenant-scoped {caseSingular.toLowerCase()} search, personal saved
        views, workload {queuePlural.toLowerCase()}, and operational
        exception dashboards.
      </p>

      {error ? (
        <p role="alert">
          The requested operation could not be completed ({error}).
        </p>
      ) : null}
      {saved ? <p role="status">Saved views updated.</p> : null}

      <section>
        <h2>Operational pulse</h2>
        <ul>
          {cards.map(([focus, label, value]) => (
            <li key={focus}>
              <Link href={hrefFor(focusDefinition(focus))}>
                {label}: {value}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Search and work queue</h2>
        <form method="get">
          <label>
            Search
            <input
              name="q"
              defaultValue={definition.q ?? ""}
              maxLength={200}
              placeholder={`${caseSingular} number, title, summary, type, or tag`}
            />
          </label>
          <label>
            Status
            <input
              name="status"
              defaultValue={definition.statuses.join(",")}
              placeholder="open,resolved"
            />
          </label>
          <label>
            Priority
            <input
              name="priority"
              defaultValue={definition.priorities.join(",")}
              placeholder="critical,high"
            />
          </label>
          <label>
            {queueSingular}
            <select
              name="queue"
              defaultValue={definition.queueIds[0] ?? ""}
            >
              <option value="">Any {queueSingular.toLowerCase()}</option>
              {queues.map((queue) => (
                <option key={queue.id} value={queue.id}>
                  {queue.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Assignee
            <select
              name="assignee"
              defaultValue={
                definition.assigneeMembershipIds[0] ?? ""
              }
            >
              <option value="">Any assignee</option>
              {members.map((member) => (
                <option
                  key={member.membershipId}
                  value={member.membershipId}
                >
                  {member.displayName ?? member.email}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tags
            <input
              name="tag"
              defaultValue={definition.tags.join(",")}
              placeholder="urgent,records"
            />
          </label>
          <label>
            Focus
            <select name="focus" defaultValue={definition.focus}>
              {operationalFocuses.map((focus) => (
                <option key={focus} value={focus}>
                  {focusLabels[focus]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Sort
            <select name="sort" defaultValue={definition.sort}>
              <option value="updated_desc">Recently updated</option>
              <option value="created_desc">Recently created</option>
              <option value="priority_desc">Priority</option>
            </select>
          </label>
          <label>
            Limit
            <select name="limit" defaultValue={String(definition.limit)}>
              {[25, 50, 100, 200].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">Search</button>
          {" "}
          <Link href="/admin/operations">Clear</Link>
        </form>

        {records.length === 0 ? (
          <p>No {casePlural.toLowerCase()} match this operational view.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{caseSingular}</th>
                <th>Title</th>
                <th>Status</th>
                <th>Priority</th>
                <th>{queueSingular}</th>
                <th>Assignee</th>
                <th>Exceptions</th>
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
                  <td>{record.queueName ?? "—"}</td>
                  <td>
                    {record.assigneeDisplayName ??
                      record.assigneeEmail ??
                      "—"}
                  </td>
                  <td>
                    {[
                      record.hasOverdueDeadline ? "overdue" : null,
                      record.hasOpenReview ? "open review" : null,
                      record.escalationLevel > 0
                        ? `escalated ${record.escalationLevel}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </td>
                  <td>{record.updatedAt.toISOString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>Saved views</h2>
        {savedViews.length === 0 ? (
          <p>No personal operational views saved.</p>
        ) : (
          <ul>
            {savedViews.map((view) => {
              let savedDefinition: CaseSearchDefinition;
              try {
                savedDefinition = parseCaseSearchDefinition(
                  view.definition,
                );
              } catch {
                return (
                  <li key={view.id}>
                    {view.name} — invalid saved definition
                    <form action={deleteOperationalViewAction}>
                      <input
                        type="hidden"
                        name="viewId"
                        value={view.id}
                      />
                      <button type="submit">Delete</button>
                    </form>
                  </li>
                );
              }

              return (
                <li key={view.id}>
                  <Link href={hrefFor(savedDefinition)}>
                    {view.name}
                    {view.isDefault ? " (default)" : ""}
                  </Link>
                  {!view.isDefault ? (
                    <form action={setDefaultOperationalViewAction}>
                      <input
                        type="hidden"
                        name="viewId"
                        value={view.id}
                      />
                      <button type="submit">Make default</button>
                    </form>
                  ) : null}
                  <form action={deleteOperationalViewAction}>
                    <input
                      type="hidden"
                      name="viewId"
                      value={view.id}
                    />
                    <button type="submit">Delete</button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}

        <form action={saveOperationalViewAction}>
          <label>
            Save current search as
            <input name="name" maxLength={120} required />
          </label>
          <input
            type="hidden"
            name="definition"
            value={JSON.stringify(definition)}
          />
          <label>
            <input
              type="checkbox"
              name="isDefault"
              value="true"
            />
            Make default
          </label>
          <button type="submit">Save view</button>
        </form>
      </section>

      <section>
        <h2>{queueSingular} workload</h2>
        {queueWorkload.length === 0 ? (
          <p>No routing {queuePlural.toLowerCase()} are configured.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Queue</th>
                <th>Status</th>
                <th>Open {casePlural.toLowerCase()}</th>
              </tr>
            </thead>
            <tbody>
              {queueWorkload.map((row) => (
                <tr key={row.queueId}>
                  <td>
                    <Link
                      href={hrefFor(
                        parseCaseSearchDefinition({
                          statuses: [],
                          priorities: [],
                          queueIds: [row.queueId],
                          assigneeMembershipIds: [],
                          tags: [],
                          focus: "all",
                          sort: "updated_desc",
                          limit: 50,
                        }),
                      )}
                    >
                      {row.queueName}
                    </Link>
                  </td>
                  <td>{row.queueStatus}</td>
                  <td>{Number(row.caseCount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>Staff workload</h2>
        <table>
          <thead>
            <tr>
              <th>Staff member</th>
              <th>Title</th>
              <th>Open assigned {casePlural.toLowerCase()}</th>
            </tr>
          </thead>
          <tbody>
            {memberWorkload.map((row) => (
              <tr key={row.membershipId}>
                <td>
                  <Link
                    href={hrefFor(
                      parseCaseSearchDefinition({
                        statuses: [],
                        priorities: [],
                        queueIds: [],
                        assigneeMembershipIds: [
                          row.membershipId,
                        ],
                        tags: [],
                        focus: "all",
                        sort: "updated_desc",
                        limit: 50,
                      }),
                    )}
                  >
                    {row.displayName ?? row.email}
                  </Link>
                </td>
                <td>{row.title ?? "—"}</td>
                <td>{Number(row.caseCount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
