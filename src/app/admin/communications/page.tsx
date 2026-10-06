import Link from "next/link";
import { redirect } from "next/navigation";
import { getRuntimeDatabase } from "@/db/runtime";
import {
  hasPermission,
  requireTenantScope,
} from "@/modules/auth/authorization";
import { getCurrentAuthorizationContext } from "@/modules/auth/server-session";
import {
  listCommunicationTemplates,
  listCorrespondenceDeliveryQueue,
} from "@/modules/communications/repository";
import { communicationTemplateVariables } from "@/modules/communications/template";
import { createCommunicationTemplateAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function CommunicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const context = await getCurrentAuthorizationContext();
  if (!context) redirect("/login");
  if (!context.tenantScope) redirect("/select-organization");
  if (!hasPermission(context, "correspondence:view")) {
    redirect("/forbidden");
  }

  const scope = requireTenantScope(context);
  const db = getRuntimeDatabase();
  const { error } = await searchParams;
  const [templates, queue] = await Promise.all([
    listCommunicationTemplates(db, scope),
    listCorrespondenceDeliveryQueue(db, scope),
  ]);
  const canManageTemplates = hasPermission(
    context,
    "communication:template_manage",
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
        <Link href="/admin/deadlines">Deadlines</Link>
        {" · "}
        <Link href="/admin/documents">Documents</Link>
        {" · "}
        <Link href="/admin/cases">Cases</Link>
        {" · "}
        <Link href="/admin/audit">Audit</Link>
      </nav>

      <h1>Communications</h1>
      <p>
        Templates and outbound delivery state are shared across the
        organization. Actual provider delivery is intentionally behind the
        communication transport adapter.
      </p>

      {error ? (
        <p role="alert">
          The requested communication operation could not be completed (
          {error}).
        </p>
      ) : null}

      <section>
        <h2>Outbound delivery queue</h2>
        {queue.length === 0 ? (
          <p>No queued or failed outbound correspondence.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Case</th>
                <th>Channel</th>
                <th>Status</th>
                <th>Queued</th>
                <th>Failure</th>
              </tr>
            </thead>
            <tbody>
              {queue.map(({ message, case: caseRecord }) => (
                <tr key={message.id}>
                  <td>
                    <Link href={`/admin/cases/${caseRecord.id}`}>
                      {caseRecord.caseNumber}
                    </Link>
                  </td>
                  <td>{message.channel}</td>
                  <td>{message.status}</td>
                  <td>{message.queuedAt?.toISOString() ?? "—"}</td>
                  <td>{message.failureMessage ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>Communication templates</h2>
        {templates.length === 0 ? (
          <p>No communication templates configured.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Key</th>
                <th>Name</th>
                <th>Channel</th>
                <th>Visibility</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((template) => (
                <tr key={template.id}>
                  <td><code>{template.key}</code></td>
                  <td>{template.name}</td>
                  <td>{template.channel}</td>
                  <td>{template.defaultVisibility}</td>
                  <td>{template.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {canManageTemplates ? (
        <section>
          <h2>Create communication template</h2>
          <p>
            Supported placeholders:{" "}
            {communicationTemplateVariables
              .map((key) => `{{${key}}}`)
              .join(", ")}
          </p>
          <form action={createCommunicationTemplateAction}>
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
              Channel
              <select name="channel" defaultValue="email">
                <option value="email">email</option>
                <option value="letter">letter</option>
                <option value="portal">portal</option>
                <option value="manual">manual</option>
              </select>
            </label>
            <label>
              Default visibility
              <select
                name="defaultVisibility"
                defaultValue="case_participants"
              >
                <option value="case_participants">
                  case participants
                </option>
                <option value="internal">internal</option>
                <option value="public">public</option>
              </select>
            </label>
            <label>
              Subject template
              <input name="subjectTemplate" />
            </label>
            <label>
              Body template
              <textarea name="bodyTemplate" rows={8} required />
            </label>
            <button type="submit">Create template</button>
          </form>
        </section>
      ) : null}
    </main>
  );
}
