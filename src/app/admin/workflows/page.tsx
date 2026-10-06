import Link from "next/link";
import { redirect } from "next/navigation";
import { getRuntimeDatabase } from "@/db/runtime";
import {
  hasPermission,
  requireTenantScope,
} from "@/modules/auth/authorization";
import { getCurrentAuthorizationContext } from "@/modules/auth/server-session";
import { listForms } from "@/modules/forms/repository";
import { defaultCaseWorkflowDefinition } from "@/modules/workflows/default-workflow";
import {
  listWorkflowBindings,
  listWorkflows,
  listWorkflowVersions,
} from "@/modules/workflows/repository";
import {
  bindWorkflowToFormAction,
  createWorkflowAction,
  createWorkflowVersionAction,
  publishWorkflowVersionAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function WorkflowAdministrationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const context = await getCurrentAuthorizationContext();
  if (!context) redirect("/login");
  if (!context.tenantScope) redirect("/select-organization");
  if (!hasPermission(context, "workflow:view")) {
    redirect("/forbidden");
  }

  const scope = requireTenantScope(context);
  const db = getRuntimeDatabase();
  const [workflows, forms, bindings] = await Promise.all([
    listWorkflows(db, scope),
    listForms(db, scope),
    listWorkflowBindings(db, scope),
  ]);
  const workflowsWithVersions = await Promise.all(
    workflows.map(async (workflow) => ({
      workflow,
      versions: await listWorkflowVersions(
        db,
        scope,
        workflow.id,
      ),
    })),
  );
  const { error } = await searchParams;
  const canManage = hasPermission(context, "workflow:manage");
  const bindableWorkflows = workflowsWithVersions
    .filter(({ versions }) =>
      versions.some((version) => version.status === "published"),
    )
    .map(({ workflow }) => workflow);
  const bindingByForm = new Map(
    bindings.map((binding) => [
      binding.formId,
      binding.workflowId,
    ]),
  );
  const starterJson = JSON.stringify(
    defaultCaseWorkflowDefinition,
    null,
    2,
  );

  return (
    <main>
      <nav>
        <Link href="/admin/organizations">Organization</Link>
        {" · "}
        <Link href="/admin/forms">Forms</Link>
        {" · "}
        <Link href="/admin/routing">Routing</Link>
        {" · "}
        <Link href="/admin/documents">Documents</Link>
        {" · "}
        <Link href="/admin/cases">Cases</Link>
        {" · "}
        <Link href="/admin/deadlines">Deadlines</Link>\n        {" · "}\n        <Link href="/admin/communications">Communications</Link>
        {" · "}
        <Link href="/admin/audit">Audit</Link>
      </nav>

      <h1>Workflow administration</h1>
      <p>
        Workflows are versioned configuration. New cases receive a snapshot
        of the published workflow bound to their intake form; later workflow
        edits do not change those existing cases.
      </p>

      {error ? (
        <p role="alert">
          The requested workflow operation could not be completed ({error}).
        </p>
      ) : null}

      {workflowsWithVersions.length === 0 ? (
        <p>No custom workflows have been configured.</p>
      ) : (
        workflowsWithVersions.map(({ workflow, versions }) => {
          const latest = versions[0];

          return (
            <section key={workflow.id}>
              <h2>{workflow.name}</h2>
              <p>
                Slug: <code>{workflow.slug}</code> · Status:{" "}
                {workflow.status}
              </p>
              {workflow.description ? (
                <p>{workflow.description}</p>
              ) : null}

              <h3>Versions</h3>
              <ul>
                {versions.map((version) => (
                  <li key={version.id}>
                    Version {version.versionNumber} — {version.status}
                    {version.publishedAt
                      ? ` — published ${version.publishedAt.toISOString()}`
                      : ""}
                    {canManage && version.status === "draft" ? (
                      <form action={publishWorkflowVersionAction}>
                        <input
                          type="hidden"
                          name="versionId"
                          value={version.id}
                        />
                        <button type="submit">
                          Publish this version
                        </button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>

              {canManage ? (
                <details>
                  <summary>Create a new draft version</summary>
                  <form action={createWorkflowVersionAction}>
                    <input
                      type="hidden"
                      name="workflowId"
                      value={workflow.id}
                    />
                    <label>
                      Definition JSON
                      <textarea
                        name="definition"
                        rows={32}
                        cols={110}
                        required
                        defaultValue={JSON.stringify(
                          latest?.definition ??
                            defaultCaseWorkflowDefinition,
                          null,
                          2,
                        )}
                      />
                    </label>
                    <button type="submit">
                      Create draft version
                    </button>
                  </form>
                </details>
              ) : null}
            </section>
          );
        })
      )}

      <section>
        <h2>Intake form workflow bindings</h2>
        {forms.length === 0 ? (
          <p>Create an intake form before configuring a binding.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Form</th>
                <th>Workflow</th>
                {canManage ? <th>Change binding</th> : null}
              </tr>
            </thead>
            <tbody>
              {forms.map((form) => {
                const boundWorkflowId =
                  bindingByForm.get(form.id) ?? null;
                const boundWorkflow = workflows.find(
                  (workflow) => workflow.id === boundWorkflowId,
                );

                return (
                  <tr key={form.id}>
                    <td>{form.name}</td>
                    <td>
                      {boundWorkflow?.name ??
                        "Built-in default workflow"}
                    </td>
                    {canManage ? (
                      <td>
                        {bindableWorkflows.length === 0 ? (
                          "Publish a custom workflow first."
                        ) : (
                          <form action={bindWorkflowToFormAction}>
                            <input
                              type="hidden"
                              name="formId"
                              value={form.id}
                            />
                            <select
                              name="workflowId"
                              defaultValue={boundWorkflowId ?? ""}
                              required
                            >
                              <option value="" disabled>
                                Select workflow
                              </option>
                              {bindableWorkflows.map((workflow) => (
                                <option
                                  key={workflow.id}
                                  value={workflow.id}
                                >
                                  {workflow.name}
                                </option>
                              ))}
                            </select>
                            <button type="submit">Bind</button>
                          </form>
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {canManage ? (
        <section>
          <h2>Create workflow</h2>
          <form action={createWorkflowAction}>
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
              Initial definition JSON
              <textarea
                name="definition"
                rows={36}
                cols={110}
                required
                defaultValue={starterJson}
              />
            </label>

            <button type="submit">
              Create workflow and draft version
            </button>
          </form>
        </section>
      ) : null}

      <section>
        <h2>Document guards</h2>
        <p>
          Workflow definitions can already require document types and counts.
          Until the PR 8 document/evidence subsystem is connected, such guards
          intentionally fail closed.
        </p>
      </section>
    </main>
  );
}
