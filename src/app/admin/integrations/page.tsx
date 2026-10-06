import Link from "next/link";
import { redirect } from "next/navigation";
import { getRuntimeDatabase } from "@/db/runtime";
import {
  hasPermission,
  requireTenantScope,
} from "@/modules/auth/authorization";
import { getCurrentAuthorizationContext } from "@/modules/auth/server-session";
import { corePermissions } from "@/modules/auth/permissions";
import { listApiClients } from "@/modules/api/auth";
import {
  listWebhookDeliveries,
  listWebhookSubscriptions,
} from "@/modules/webhooks/service";
import {
  createWebhookSubscriptionAction,
  disableWebhookSubscriptionAction,
  revokeApiClientAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; updated?: string }>;
}) {
  const context = await getCurrentAuthorizationContext();
  if (!context) redirect("/login");
  if (!context.tenantScope) redirect("/select-organization");

  const canManageApi = hasPermission(context, "api:manage");
  const canManageWebhooks = hasPermission(context, "webhook:manage");
  if (!canManageApi && !canManageWebhooks) redirect("/forbidden");

  const db = getRuntimeDatabase();
  const scope = requireTenantScope(context);
  const [clients, subscriptions, deliveries] = await Promise.all([
    canManageApi ? listApiClients(db, scope) : Promise.resolve([]),
    canManageWebhooks
      ? listWebhookSubscriptions(db, scope)
      : Promise.resolve([]),
    canManageWebhooks
      ? listWebhookDeliveries(db, scope, 100)
      : Promise.resolve([]),
  ]);
  const { error, updated } = await searchParams;
  const apiScopes = corePermissions.filter(
    (permission) =>
      permission !== "api:manage" &&
      permission !== "webhook:manage",
  );

  return (
    <main>
      <nav>
        <Link href="/admin/operations">Operations</Link>
        {" · "}
        <Link href="/admin/cases">Cases</Link>
        {" · "}
        <Link href="/admin/jobs">Jobs</Link>
        {" · "}
        <Link href="/admin/audit">Audit</Link>
      </nav>

      <h1>Integrations</h1>
      <p>
        Manage scoped API credentials and signed outbound webhooks for the
        active organization.
      </p>
      <p>
        <Link href="/api/v1/openapi">OpenAPI v1 document</Link>
      </p>

      {error ? (
        <p role="alert">
          The requested integration operation failed ({error}).
        </p>
      ) : null}
      {updated ? <p role="status">Integration settings updated.</p> : null}

      {canManageApi ? (
        <section>
          <h2>API clients</h2>
          {clients.length === 0 ? (
            <p>No API clients configured.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Key prefix</th>
                  <th>Status</th>
                  <th>Scopes</th>
                  <th>Rate/min</th>
                  <th>Last used</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.id}>
                    <td>{client.name}</td>
                    <td><code>sicwe_{client.keyPrefix}_…</code></td>
                    <td>{client.status}</td>
                    <td>{client.permissions.join(", ")}</td>
                    <td>{client.rateLimitPerMinute}</td>
                    <td>
                      {client.lastUsedAt?.toISOString() ?? "Never"}
                    </td>
                    <td>
                      {client.status === "active" ? (
                        <form action={revokeApiClientAction}>
                          <input
                            type="hidden"
                            name="clientId"
                            value={client.id}
                          />
                          <button type="submit">Revoke</button>
                        </form>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h3>Create API client</h3>
          <p>
            The new bearer credential is returned once in a no-store
            response. Store it in a secrets manager.
          </p>
          <form action="/admin/integrations/api-keys" method="post">
            <label>
              Name
              <input name="name" maxLength={120} required />
            </label>
            <label>
              Scopes (comma separated)
              <textarea
                name="permissions"
                rows={5}
                cols={100}
                required
                defaultValue="case:view,form:view"
              />
            </label>
            <p>Available scopes: {apiScopes.join(", ")}</p>
            <label>
              Requests per minute
              <input
                name="rateLimitPerMinute"
                type="number"
                min="1"
                max="10000"
                defaultValue="120"
                required
              />
            </label>
            <label>
              Expires (optional)
              <input name="expiresAt" type="datetime-local" />
            </label>
            <button type="submit">Create API client</button>
          </form>
        </section>
      ) : null}

      {canManageWebhooks ? (
        <section>
          <h2>Webhook subscriptions</h2>
          <p>
            HTTPS only. Delivery re-resolves DNS and rejects private/local
            destinations. Payloads are HMAC-SHA256 signed.
          </p>
          {subscriptions.length === 0 ? (
            <p>No webhook subscriptions configured.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Endpoint</th>
                  <th>Events</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.map((subscription) => (
                  <tr key={subscription.id}>
                    <td>{subscription.name}</td>
                    <td>{subscription.endpointUrl}</td>
                    <td>{subscription.eventTypes.join(", ")}</td>
                    <td>{subscription.status}</td>
                    <td>
                      {subscription.status === "active" ? (
                        <form action={disableWebhookSubscriptionAction}>
                          <input
                            type="hidden"
                            name="subscriptionId"
                            value={subscription.id}
                          />
                          <button type="submit">Disable</button>
                        </form>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h3>Create webhook</h3>
          <form action={createWebhookSubscriptionAction}>
            <label>
              Name
              <input name="name" maxLength={120} required />
            </label>
            <label>
              HTTPS endpoint
              <input
                name="endpointUrl"
                type="url"
                placeholder="https://example.org/webhooks/sicwe"
                required
              />
            </label>
            <label>
              Event actions (comma separated; * for all)
              <input
                name="eventTypes"
                defaultValue="case.status_changed"
                required
              />
            </label>
            <label>
              HMAC signing secret (32-256 characters)
              <input
                name="signingSecret"
                type="password"
                minLength={32}
                maxLength={256}
                autoComplete="new-password"
                required
              />
            </label>
            <button type="submit">Create webhook</button>
          </form>

          <h3>Recent deliveries</h3>
          {deliveries.length === 0 ? (
            <p>No webhook deliveries recorded.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Webhook</th>
                  <th>Event</th>
                  <th>Status</th>
                  <th>Attempts</th>
                  <th>HTTP</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map(({ delivery, subscriptionName, eventAction }) => (
                  <tr key={delivery.id}>
                    <td>{delivery.createdAt.toISOString()}</td>
                    <td>{subscriptionName}</td>
                    <td>{eventAction}</td>
                    <td>{delivery.status}</td>
                    <td>{delivery.attemptCount}</td>
                    <td>{delivery.responseStatus ?? "—"}</td>
                    <td>{delivery.lastError ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : null}
    </main>
  );
}
