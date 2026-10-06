import Link from "next/link";
import { redirect } from "next/navigation";
import { getRuntimeDatabase } from "@/db/runtime";
import {
  hasPermission,
  requireTenantScope,
} from "@/modules/auth/authorization";
import { getCurrentAuthorizationContext } from "@/modules/auth/server-session";
import {
  listBackgroundJobs,
  listBackgroundSchedules,
} from "@/modules/jobs/repository";
import { listNotificationDeliveries } from "@/modules/notifications/repository";
import {
  retryJobAction,
  runCoreJobsOnceAction,
  seedSchedulesAction,
  setScheduleStatusAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string }>;
}) {
  const context = await getCurrentAuthorizationContext();
  if (!context) redirect("/login");
  if (!context.tenantScope) redirect("/select-organization");
  if (!hasPermission(context, "job:view")) {
    redirect("/forbidden");
  }

  const { result } = await searchParams;
  const scope = requireTenantScope(context);
  const db = getRuntimeDatabase();
  const [jobs, schedules, deliveries] = await Promise.all([
    listBackgroundJobs(db, scope),
    listBackgroundSchedules(db, scope),
    hasPermission(context, "notification:manage")
      ? listNotificationDeliveries(db, scope)
      : Promise.resolve([]),
  ]);
  const canManage = hasPermission(context, "job:manage");

  const counts = {
    pending: jobs.filter((job) => job.status === "pending").length,
    running: jobs.filter((job) => job.status === "running").length,
    dead: jobs.filter((job) => job.status === "dead").length,
  };

  return (
    <main>
      <nav>
        <Link href="/admin/cases">Cases</Link>
        {" · "}
        <Link href="/admin/deadlines">Deadlines</Link>
        {" · "}
        <Link href="/admin/reviews">Reviews</Link>
        {" · "}
        <Link href="/admin/disclosures">Disclosures</Link>
        {" · "}
        <Link href="/admin/communications">Communications</Link>
        {" · "}
        <Link href="/notifications">Notifications</Link>
        {" · "}
        <Link href="/admin/audit">Audit</Link>
      </nav>

      <h1>Background jobs</h1>
      <p>
        Pending: {counts.pending} · Running: {counts.running} · Dead:{" "}
        {counts.dead}
      </p>

      {result ? <p role="status">{result}</p> : null}

      {canManage ? (
        <section>
          <h2>Operations</h2>
          <form action={seedSchedulesAction}>
            <button type="submit">Synchronize built-in schedules</button>
          </form>
          <form action={runCoreJobsOnceAction}>
            <button type="submit">
              Run core-supported jobs once
            </button>
          </form>
          <p>
            Core-supported jobs intentionally exclude external email,
            webhook, and correspondence transports unless a deployment
            registers those handlers.
          </p>
        </section>
      ) : null}

      <section>
        <h2>Schedules</h2>
        {schedules.length === 0 ? (
          <p>No background schedules configured.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Key</th>
                <th>Job type</th>
                <th>Status</th>
                <th>Interval</th>
                <th>Next run</th>
                <th>Last enqueued</th>
                {canManage ? <th>Action</th> : null}
              </tr>
            </thead>
            <tbody>
              {schedules.map((schedule) => (
                <tr key={schedule.id}>
                  <td>{schedule.key}</td>
                  <td><code>{schedule.jobType}</code></td>
                  <td>{schedule.status}</td>
                  <td>{schedule.intervalSeconds}s</td>
                  <td>{schedule.nextRunAt.toISOString()}</td>
                  <td>
                    {schedule.lastEnqueuedAt?.toISOString() ?? "—"}
                  </td>
                  {canManage ? (
                    <td>
                      <form
                        action={setScheduleStatusAction.bind(
                          null,
                          schedule.id,
                          schedule.status === "active"
                            ? "paused"
                            : "active",
                        )}
                      >
                        <button type="submit">
                          {schedule.status === "active"
                            ? "Pause"
                            : "Resume"}
                        </button>
                      </form>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>Recent jobs</h2>
        {jobs.length === 0 ? (
          <p>No background jobs recorded.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Available</th>
                <th>Lease</th>
                <th>Last error</th>
                {canManage ? <th>Action</th> : null}
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td><code>{job.jobType}</code></td>
                  <td>{job.status}</td>
                  <td>
                    {job.attempts}/{job.maxAttempts}
                  </td>
                  <td>{job.availableAt.toISOString()}</td>
                  <td>
                    {job.leaseUntil?.toISOString() ?? "—"}
                  </td>
                  <td>{job.lastError ?? "—"}</td>
                  {canManage ? (
                    <td>
                      {job.status === "dead" ? (
                        <form
                          action={retryJobAction.bind(
                            null,
                            job.id,
                          )}
                        >
                          <button type="submit">Retry</button>
                        </form>
                      ) : (
                        "—"
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {deliveries.length > 0 ? (
        <section>
          <h2>Notification deliveries</h2>
          <table>
            <thead>
              <tr>
                <th>Channel</th>
                <th>Status</th>
                <th>Provider</th>
                <th>Attempts</th>
                <th>Last error</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((delivery) => (
                <tr key={delivery.id}>
                  <td>{delivery.channel}</td>
                  <td>{delivery.status}</td>
                  <td>{delivery.provider ?? "—"}</td>
                  <td>{delivery.attempts}</td>
                  <td>{delivery.lastError ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </main>
  );
}
