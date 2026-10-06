import Link from "next/link";
import { redirect } from "next/navigation";
import { getRuntimeDatabase } from "@/db/runtime";
import {
  hasPermission,
  requireTenantScope,
} from "@/modules/auth/authorization";
import { getCurrentAuthorizationContext } from "@/modules/auth/server-session";
import {
  findActiveApplicationManifestRevision,
  findApplicationProfile,
  listApplicationManagedResources,
  listApplicationManifestRevisions,
} from "@/modules/application/repository";
import { applyApplicationManifestAction } from "./actions";

export const dynamic = "force-dynamic";

const starterManifest = {
  schemaVersion: 1,
  application: {
    key: "thin-application",
    name: "Thin Application",
    terminology: {},
  },
};

export default async function ApplicationConfigurationPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    applied?: string;
    unchanged?: string;
  }>;
}) {
  const context = await getCurrentAuthorizationContext();
  if (!context) redirect("/login");
  if (!context.tenantScope) redirect("/select-organization");
  if (!hasPermission(context, "application:view")) {
    redirect("/forbidden");
  }

  const db = getRuntimeDatabase();
  const scope = requireTenantScope(context);
  const [profile, active, revisions, resources] =
    await Promise.all([
      findApplicationProfile(db, scope),
      findActiveApplicationManifestRevision(db, scope),
      listApplicationManifestRevisions(db, scope, 25),
      listApplicationManagedResources(db, scope),
    ]);

  const params = await searchParams;
  const canManage = hasPermission(context, "application:manage");
  const manifestText = JSON.stringify(
    active?.manifest ?? starterManifest,
    null,
    2,
  );

  return (
    <main>
      <nav>
        <Link href="/admin/operations">Operations</Link>
        {" · "}
        <Link href="/admin/cases">Cases</Link>
        {" · "}
        <Link href="/admin/forms">Forms</Link>
        {" · "}
        <Link href="/admin/workflows">Workflows</Link>
        {" · "}
        <Link href="/admin/routing">Routing</Link>
        {" · "}
        <Link href="/admin/integrations">Integrations</Link>
      </nav>

      <h1>Application configuration</h1>
      <p>
        Apply a declarative thin-application manifest without modifying
        the reusable engine.
      </p>

      {params.error ? (
        <p role="alert">
          The manifest was not applied ({params.error}).
        </p>
      ) : null}
      {params.applied ? (
        <p role="status">Application manifest applied.</p>
      ) : null}
      {params.unchanged ? (
        <p role="status">
          The submitted manifest is already active; no changes were made.
        </p>
      ) : null}

      <section>
        <h2>Active profile</h2>
        {profile && active ? (
          <dl>
            <dt>Application</dt>
            <dd>{profile.applicationName}</dd>
            <dt>Key</dt>
            <dd><code>{profile.applicationKey}</code></dd>
            <dt>Manifest hash</dt>
            <dd><code>{active.manifestHash}</code></dd>
            <dt>Applied</dt>
            <dd>{active.appliedAt.toISOString()}</dd>
            <dt>Managed resources</dt>
            <dd>{resources.length}</dd>
          </dl>
        ) : (
          <p>No application manifest has been applied.</p>
        )}
      </section>

      <section>
        <h2>Manifest</h2>
        <p>
          Reconciliation is non-destructive: resources omitted from a
          later manifest are not deleted, and an unmanaged existing
          resource cannot be silently claimed by a manifest.
        </p>
        <form action={applyApplicationManifestAction}>
          <label>
            Application manifest JSON
            <textarea
              name="manifest"
              rows={32}
              cols={120}
              defaultValue={manifestText}
              spellCheck={false}
              required
              readOnly={!canManage}
            />
          </label>
          {canManage ? (
            <button type="submit">Validate and apply manifest</button>
          ) : null}
        </form>
      </section>

      <section>
        <h2>Managed resources</h2>
        {resources.length === 0 ? (
          <p>No manifest-managed resources.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Key</th>
                <th>Resource ID</th>
                <th>Checksum</th>
              </tr>
            </thead>
            <tbody>
              {resources.map((resource) => (
                <tr key={resource.id}>
                  <td>{resource.resourceType}</td>
                  <td>{resource.resourceKey}</td>
                  <td><code>{resource.resourceId}</code></td>
                  <td><code>{resource.checksum.slice(0, 12)}…</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>Manifest history</h2>
        {revisions.length === 0 ? (
          <p>No manifest history.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Applied</th>
                <th>Key</th>
                <th>Status</th>
                <th>Hash</th>
              </tr>
            </thead>
            <tbody>
              {revisions.map((revision) => (
                <tr key={revision.id}>
                  <td>{revision.appliedAt.toISOString()}</td>
                  <td>{revision.manifestKey}</td>
                  <td>{revision.status}</td>
                  <td><code>{revision.manifestHash.slice(0, 12)}…</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
