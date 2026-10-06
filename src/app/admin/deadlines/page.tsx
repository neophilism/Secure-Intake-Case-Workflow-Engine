import Link from "next/link";
import { redirect } from "next/navigation";
import { getRuntimeDatabase } from "@/db/runtime";
import {
  hasPermission,
  requireTenantScope,
} from "@/modules/auth/authorization";
import { getCurrentAuthorizationContext } from "@/modules/auth/server-session";
import {
  listCalendarExclusions,
  listDeadlineCalendars,
  listDeadlineDashboard,
} from "@/modules/deadlines/repository";
import {
  addDeadlineCalendarExclusionAction,
  createDeadlineCalendarAction,
  runDeadlineSweepAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function DeadlinesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sweep?: string }>;
}) {
  const context = await getCurrentAuthorizationContext();
  if (!context) redirect("/login");
  if (!context.tenantScope) redirect("/select-organization");
  if (!hasPermission(context, "deadline:view")) {
    redirect("/forbidden");
  }

  const scope = requireTenantScope(context);
  const db = getRuntimeDatabase();
  const { error, sweep } = await searchParams;
  const [dashboard, calendars] = await Promise.all([
    listDeadlineDashboard(db, scope),
    listDeadlineCalendars(db, scope),
  ]);
  const exclusions = new Map(
    await Promise.all(
      calendars.map(async (calendar) => [
        calendar.id,
        await listCalendarExclusions(db, scope, calendar.id),
      ] as const),
    ),
  );

  const canManage = hasPermission(context, "deadline:manage");
  const counts = {
    active: dashboard.filter((row) => row.deadline.status === "active").length,
    paused: dashboard.filter((row) => row.deadline.status === "paused").length,
    overdue: dashboard.filter((row) => row.deadline.status === "overdue").length,
  };

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
        <Link href="/admin/documents">Documents</Link>
        {" · "}
        <Link href="/admin/cases">Cases</Link>
        {" · "}
        <Link href="/admin/reviews">Reviews</Link>
        {" · "}
        <Link href="/admin/disclosures">Disclosures</Link>
        {" · "}
        <Link href="/admin/communications">Communications</Link>
        {" · "}
        <Link href="/notifications">Notifications</Link>
        {" · "}
        <Link href="/admin/jobs">Jobs</Link>
        {" · "}
        <Link href="/admin/audit">Audit</Link>
      </nav>

      <h1>Deadlines & statutory clocks</h1>
      <p>
        Active: {counts.active} · Paused: {counts.paused} · Overdue:{" "}
        {counts.overdue}
      </p>

      {sweep ? <p role="status">Sweep completed: {sweep}</p> : null}
      {error ? (
        <p role="alert">
          Deadline operation could not be completed ({error}).
        </p>
      ) : null}

      {canManage ? (
        <section>
          <h2>Clock evaluation</h2>
          <p>
            Run the scheduler-ready sweep now to issue warnings, mark overdue
            clocks, and apply configured escalation rules.
          </p>
          <form action={runDeadlineSweepAction}>
            <button type="submit">Run deadline sweep</button>
          </form>
        </section>
      ) : null}

      <section>
        <h2>Case deadline dashboard</h2>
        {dashboard.length === 0 ? (
          <p>No case deadlines have been instantiated.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Case</th>
                <th>Deadline</th>
                <th>Status</th>
                <th>Due</th>
                <th>Warning</th>
                <th>Escalation</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.map(({ deadline, case: caseRecord }) => (
                <tr key={deadline.id}>
                  <td>
                    <Link href={`/admin/cases/${caseRecord.id}`}>
                      {caseRecord.caseNumber}
                    </Link>
                  </td>
                  <td>
                    {deadline.label} ({deadline.policyKey} #
                    {deadline.occurrence})
                  </td>
                  <td>{deadline.status}</td>
                  <td>{deadline.dueAt.toISOString()}</td>
                  <td>
                    {deadline.warningAt?.toISOString() ?? "—"}
                    {deadline.warningIssuedAt ? " (issued)" : ""}
                  </td>
                  <td>
                    {deadline.escalatedAt
                      ? `Applied ${deadline.escalatedAt.toISOString()}`
                      : deadline.escalationPriority ||
                          deadline.escalationQueueSlug
                        ? "Configured"
                        : "—"}
                    {deadline.lastEscalationError
                      ? ` — ${deadline.lastEscalationError}`
                      : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>Business-day calendars</h2>
        {calendars.length === 0 ? (
          <p>No deadline calendars configured.</p>
        ) : (
          calendars.map((calendar) => (
            <article key={calendar.id}>
              <h3>
                {calendar.name} (<code>{calendar.key}</code>)
              </h3>
              <p>
                Timezone: {calendar.timeZone}; weekend days:{" "}
                {calendar.weekendDays.join(", ") || "none"}
              </p>
              <h4>Excluded dates</h4>
              {exclusions.get(calendar.id)?.length ? (
                <ul>
                  {exclusions.get(calendar.id)!.map((entry) => (
                    <li key={entry.id}>
                      {entry.localDate}
                      {entry.label ? ` — ${entry.label}` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No excluded dates.</p>
              )}

              {canManage ? (
                <form action={addDeadlineCalendarExclusionAction}>
                  <input
                    type="hidden"
                    name="calendarId"
                    value={calendar.id}
                  />
                  <label>
                    Excluded local date
                    <input name="localDate" type="date" required />
                  </label>
                  <label>
                    Label
                    <input name="label" />
                  </label>
                  <button type="submit">Add exclusion</button>
                </form>
              ) : null}
            </article>
          ))
        )}
      </section>

      {canManage ? (
        <section>
          <h2>Create business-day calendar</h2>
          <form action={createDeadlineCalendarAction}>
            <label>
              Stable key
              <input
                name="key"
                pattern="[a-z][a-z0-9_-]*"
                required
              />
            </label>
            <label>
              Name
              <input name="name" required />
            </label>
            <label>
              IANA timezone
              <input
                name="timeZone"
                defaultValue="America/New_York"
                required
              />
            </label>
            <label>
              Weekend weekdays (0=Sunday ... 6=Saturday)
              <input name="weekendDays" defaultValue="0,6" />
            </label>
            <button type="submit">Create calendar</button>
          </form>
        </section>
      ) : null}
    </main>
  );
}
