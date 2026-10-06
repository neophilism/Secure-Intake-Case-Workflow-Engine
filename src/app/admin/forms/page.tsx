import { redirect } from "next/navigation";
import {
  hasPermission,
  requireTenantScope,
} from "@/modules/auth/authorization";
import { getCurrentAuthorizationContext } from "@/modules/auth/server-session";
import { getRuntimeDatabase } from "@/db/runtime";
import {
  listForms,
  listFormVersions,
} from "@/modules/forms/repository";
import { starterFormDefinition } from "@/modules/forms/starter-definition";
import {
  createDraftVersionAction,
  createFormAction,
  publishVersionAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function FormAdministrationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const context = await getCurrentAuthorizationContext();
  if (!context) redirect("/login");
  if (!context.tenantScope) redirect("/select-organization");
  if (!hasPermission(context, "form:view")) redirect("/forbidden");

  const scope = requireTenantScope(context);
  const forms = await listForms(getRuntimeDatabase(), scope);
  const formsWithVersions = await Promise.all(
    forms.map(async (form) => ({
      form,
      versions: await listFormVersions(
        getRuntimeDatabase(),
        scope,
        form.id,
      ),
    })),
  );
  const { error } = await searchParams;
  const canManage = hasPermission(context, "form:manage");
  const starterJson = JSON.stringify(starterFormDefinition, null, 2);

  return (
    <main>
      <nav>
        <a href="/admin/organizations">Organization</a>
        {" · "}
        <a href="/admin/cases">Cases</a>
      </nav>

      <h1>Intake form administration</h1>
      <p>
        Forms are configuration-driven and versioned. Publishing a new version
        supersedes the prior published version without rewriting old
        submissions.
      </p>

      {error ? (
        <p role="alert">
          The requested form operation could not be completed ({error}).
        </p>
      ) : null}

      {formsWithVersions.length === 0 ? (
        <p>No intake forms have been configured.</p>
      ) : (
        formsWithVersions.map(({ form, versions }) => {
          const latest = versions[0];

          return (
            <section key={form.id}>
              <h2>{form.name}</h2>
              <p>
                Slug: <code>{form.slug}</code> · Access: {form.accessMode} ·
                Status: {form.status}
              </p>
              {form.description ? <p>{form.description}</p> : null}

              <h3>Versions</h3>
              <ul>
                {versions.map((version) => (
                  <li key={version.id}>
                    Version {version.versionNumber} — {version.status}
                    {version.publishedAt
                      ? ` — published ${version.publishedAt.toISOString()}`
                      : ""}
                    {canManage && version.status === "draft" ? (
                      <form action={publishVersionAction}>
                        <input
                          type="hidden"
                          name="versionId"
                          value={version.id}
                        />
                        <button type="submit">Publish this version</button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>

              {canManage ? (
                <details>
                  <summary>Create a new draft version</summary>
                  <form action={createDraftVersionAction}>
                    <input type="hidden" name="formId" value={form.id} />
                    <label>
                      Definition JSON
                      <textarea
                        name="definition"
                        rows={24}
                        cols={100}
                        required
                        defaultValue={JSON.stringify(
                          latest?.definition ?? starterFormDefinition,
                          null,
                          2,
                        )}
                      />
                    </label>
                    <button type="submit">Create draft version</button>
                  </form>
                </details>
              ) : null}
            </section>
          );
        })
      )}

      {canManage ? (
        <section>
          <h2>Create intake form</h2>
          <form action={createFormAction}>
            <label>
              Name
              <input name="name" required />
            </label>

            <label>
              Slug
              <input
                name="slug"
                required
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              />
            </label>

            <label>
              Description
              <textarea name="description" rows={3} />
            </label>

            <label>
              Access
              <select name="accessMode" defaultValue="public">
                <option value="public">Public</option>
                <option value="authenticated">Authenticated</option>
              </select>
            </label>

            <label>
              Initial definition JSON
              <textarea
                name="definition"
                rows={28}
                cols={100}
                required
                defaultValue={starterJson}
              />
            </label>

            <button type="submit">Create form and draft version</button>
          </form>
        </section>
      ) : null}
    </main>
  );
}
