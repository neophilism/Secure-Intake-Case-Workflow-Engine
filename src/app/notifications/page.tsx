import Link from "next/link";
import { redirect } from "next/navigation";
import { getRuntimeDatabase } from "@/db/runtime";
import {
  hasPermission,
  requireTenantScope,
} from "@/modules/auth/authorization";
import { getCurrentAuthorizationContext } from "@/modules/auth/server-session";
import {
  listMembershipNotificationPreferences,
  listMembershipNotifications,
} from "@/modules/notifications/repository";
import {
  markNotificationReadAction,
  setNotificationPreferenceAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const context = await getCurrentAuthorizationContext();
  if (!context) redirect("/login");
  if (!context.tenantScope || !context.membership) {
    redirect("/select-organization");
  }
  if (!hasPermission(context, "notification:view")) {
    redirect("/forbidden");
  }

  const { error } = await searchParams;
  const scope = requireTenantScope(context);
  const db = getRuntimeDatabase();
  const [notifications, preferences] = await Promise.all([
    listMembershipNotifications(
      db,
      scope,
      context.membership.id,
    ),
    listMembershipNotificationPreferences(
      db,
      scope,
      context.membership.id,
    ),
  ]);

  const preference = (channel: string) =>
    preferences.find(
      (row) =>
        row.eventType === "*" && row.channel === channel,
    );

  const channels = [
    {
      key: "in_app",
      label: "In-app",
      defaultEnabled: true,
      destination: null,
      note: "Shown in this notification inbox.",
    },
    {
      key: "email",
      label: "Email",
      defaultEnabled: false,
      destination: context.user.email,
      note:
        "Requires an email notification transport in the deployed worker.",
    },
    {
      key: "webhook",
      label: "Webhook",
      defaultEnabled: false,
      destination: null,
      note:
        "Requires an HTTPS destination and a webhook transport in the deployed worker.",
    },
  ] as const;

  return (
    <main>
      <nav>
        <Link href="/admin/cases">Cases</Link>
        {" · "}
        <Link href="/admin/communications">Communications</Link>
        {" · "}
        <Link href="/notifications">Notifications</Link>
      </nav>

      <h1>Notifications</h1>

      {error ? (
        <p role="alert">
          Notification preference update failed.
        </p>
      ) : null}

      <section>
        <h2>Delivery preferences</h2>
        <p>
          These are organization-specific preferences. Event-specific
          preferences can override them through the service API later.
        </p>

        {channels.map((channel) => {
          const saved = preference(channel.key);
          const enabled =
            saved?.enabled ?? channel.defaultEnabled;
          const destination =
            saved?.destination ??
            channel.destination ??
            "";

          return (
            <form
              key={channel.key}
              action={setNotificationPreferenceAction}
            >
              <input
                type="hidden"
                name="channel"
                value={channel.key}
              />
              <fieldset>
                <legend>{channel.label}</legend>
                <label>
                  Status
                  <select
                    name="enabled"
                    defaultValue={String(enabled)}
                  >
                    <option value="true">enabled</option>
                    <option value="false">disabled</option>
                  </select>
                </label>
                {channel.key !== "in_app" ? (
                  <label>
                    Destination
                    <input
                      name="destination"
                      defaultValue={destination}
                      placeholder={
                        channel.key === "email"
                          ? context.user.email
                          : "https://example.gov/hooks/notifications"
                      }
                    />
                  </label>
                ) : null}
                <p>{channel.note}</p>
                <button type="submit">
                  Save {channel.label.toLowerCase()} preference
                </button>
              </fieldset>
            </form>
          );
        })}
      </section>

      <section>
        <h2>Inbox</h2>
        {notifications.length === 0 ? (
          <p>No in-app notifications.</p>
        ) : (
          <ol>
            {notifications.map((notification) => (
              <li key={notification.id}>
                <article>
                  <h3>{notification.title}</h3>
                  <p>
                    {notification.severity} ·{" "}
                    {notification.eventType} ·{" "}
                    {notification.createdAt.toISOString()}
                  </p>
                  <p>{notification.body}</p>
                  {notification.link ? (
                    <p>
                      <Link href={notification.link}>
                        Open related item
                      </Link>
                    </p>
                  ) : null}
                  {notification.readAt ? (
                    <p>
                      Read {notification.readAt.toISOString()}
                    </p>
                  ) : (
                    <form
                      action={markNotificationReadAction.bind(
                        null,
                        notification.id,
                      )}
                    >
                      <button type="submit">Mark read</button>
                    </form>
                  )}
                </article>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
