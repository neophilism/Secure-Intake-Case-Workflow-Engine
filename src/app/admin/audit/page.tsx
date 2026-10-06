import Link from "next/link";
import { redirect } from "next/navigation";
import { getRuntimeDatabase } from "@/db/runtime";
import {
  hasPermission,
  requireTenantScope,
} from "@/modules/auth/authorization";
import { getCurrentAuthorizationContext } from "@/modules/auth/server-session";
import { listAuditEvents } from "@/modules/audit/repository";

export const dynamic = "force-dynamic";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    action?: string;
    resourceType?: string;
    resourceId?: string;
  }>;
}) {
  const context = await getCurrentAuthorizationContext();
  if (!context) redirect("/login");
  if (!context.tenantScope) redirect("/select-organization");
  if (!hasPermission(context, "audit:view")) {
    redirect("/forbidden");
  }

  const filters = await searchParams;
  const events = await listAuditEvents(
    getRuntimeDatabase(),
    requireTenantScope(context),
    filters,
  );

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
        <Link href="/admin/cases">Cases</Link>\n        {" · "}\n        <Link href="/admin/deadlines">Deadlines</Link>
        {" · "}
        <Link href="/admin/communications">Communications</Link>
        {" · "}
        <Link href="/notifications">Notifications</Link>
        {" · "}
        <Link href="/admin/jobs">Jobs</Link>
      </nav>

      <h1>Immutable audit log</h1>
      <p>
        This view is read-only. Audit events are append-only and database
        mutation triggers reject updates and deletes.
      </p>

      <form method="get">
        <label>
          Action contains
          <input name="action" defaultValue={filters.action ?? ""} />
        </label>
        <label>
          Resource type
          <input
            name="resourceType"
            defaultValue={filters.resourceType ?? ""}
          />
        </label>
        <label>
          Resource ID
          <input
            name="resourceId"
            defaultValue={filters.resourceId ?? ""}
          />
        </label>
        <button type="submit">Filter</button>
      </form>

      {events.length === 0 ? (
        <p>No matching audit events.</p>
      ) : (
        <ol>
          {events.map((event) => (
            <li key={event.id}>
              <article>
                <h2>{event.action}</h2>
                <dl>
                  <dt>Occurred</dt>
                  <dd>{event.occurredAt.toISOString()}</dd>
                  <dt>Actor</dt>
                  <dd>
                    {event.actorType}
                    {event.actorUserId
                      ? ` — ${event.actorUserId}`
                      : ""}
                  </dd>
                  <dt>Resource</dt>
                  <dd>
                    {event.resourceType}: {event.resourceId}
                  </dd>
                  <dt>Parent</dt>
                  <dd>
                    {event.parentResourceType &&
                    event.parentResourceId
                      ? `${event.parentResourceType}: ${event.parentResourceId}`
                      : "—"}
                  </dd>
                  <dt>Correlation</dt>
                  <dd><code>{event.correlationId}</code></dd>
                  <dt>Source</dt>
                  <dd>{event.source}</dd>
                </dl>

                {event.previousState ? (
                  <>
                    <h3>Previous state</h3>
                    <pre>
                      {JSON.stringify(event.previousState, null, 2)}
                    </pre>
                  </>
                ) : null}
                {event.newState ? (
                  <>
                    <h3>New state</h3>
                    <pre>
                      {JSON.stringify(event.newState, null, 2)}
                    </pre>
                  </>
                ) : null}
                {Object.keys(event.metadata).length > 0 ? (
                  <>
                    <h3>Metadata</h3>
                    <pre>
                      {JSON.stringify(event.metadata, null, 2)}
                    </pre>
                  </>
                ) : null}
              </article>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
