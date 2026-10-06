import Link from "next/link";
import { redirect } from "next/navigation";
import { getRuntimeDatabase } from "@/db/runtime";
import {
  hasPermission,
  requireTenantScope,
} from "@/modules/auth/authorization";
import { getCurrentAuthorizationContext } from "@/modules/auth/server-session";
import { listDocumentTypes } from "@/modules/documents/repository";
import { createDocumentTypeAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function DocumentAdministrationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const context = await getCurrentAuthorizationContext();
  if (!context) redirect("/login");
  if (!context.tenantScope) redirect("/select-organization");
  if (!hasPermission(context, "document:view")) {
    redirect("/forbidden");
  }

  const types = await listDocumentTypes(
    getRuntimeDatabase(),
    requireTenantScope(context),
  );
  const { error } = await searchParams;
  const canManage = hasPermission(context, "document:manage");

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
        <Link href="/admin/cases">Cases</Link>
      </nav>

      <h1>Documents & evidence</h1>
      <p>
        Document types are stable keys used by workflow guards. Uploaded
        content remains quarantined until a trusted malware-scan result marks
        the exact immutable version clean.
      </p>

      {error ? (
        <p role="alert">
          The requested document operation could not be completed ({error}).
        </p>
      ) : null}

      <section>
        <h2>Document types</h2>
        {types.length === 0 ? (
          <p>No document types are configured.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Key</th>
                <th>Name</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {types.map((type) => (
                <tr key={type.id}>
                  <td><code>{type.key}</code></td>
                  <td>{type.name}</td>
                  <td>{type.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {canManage ? (
        <section>
          <h2>Create document type</h2>
          <form action={createDocumentTypeAction}>
            <label>
              Stable key
              <input
                name="key"
                required
                pattern="[a-z][a-z0-9_-]*"
              />
            </label>
            <label>
              Name
              <input name="name" required />
            </label>
            <label>
              Description
              <textarea name="description" rows={3} />
            </label>
            <button type="submit">Create document type</button>
          </form>
        </section>
      ) : null}
    </main>
  );
}
