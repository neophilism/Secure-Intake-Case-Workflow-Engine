import { redirect } from "next/navigation";
import { getRuntimeDatabase } from "@/db/runtime";
import { OrganizationTree } from "@/components/admin/organization-tree";
import { buildOfficeTree } from "@/modules/organizations/office-tree";
import { listOffices } from "@/modules/organizations/repository";
import {
  hasPermission,
  requireTenantScope,
} from "@/modules/auth/authorization";
import { getCurrentAuthorizationContext } from "@/modules/auth/server-session";
import { logoutAction } from "@/app/logout/actions";
import { createOfficeAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function OrganizationAdministrationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const context = await getCurrentAuthorizationContext();
  if (!context) {
    redirect("/login");
  }
  if (!context.tenantScope) {
    redirect("/select-organization");
  }
  if (!hasPermission(context, "organization:view")) {
    redirect("/forbidden");
  }

  const scope = requireTenantScope(context);
  const officeRecords = await listOffices(getRuntimeDatabase(), scope);
  const officeTree = buildOfficeTree(scope, officeRecords);
  const { error } = await searchParams;
  const canManageOffices = hasPermission(context, "office:manage");

  return (
    <main>
      <header>
        <div>
          <h1>Organization administration</h1>
          <p>
            Signed in as {context.user.displayName ?? context.user.email}
            {context.roleKeys.length > 0
              ? ` — roles: ${context.roleKeys.join(", ")}`
              : ""}
          </p>
        </div>
        <form action={logoutAction}>
          <button type="submit">Sign out</button>
        </form>
      </header>

      <section>
        <h2>Office hierarchy</h2>
        <OrganizationTree offices={officeTree} />
      </section>

      {canManageOffices ? (
        <section>
          <h2>Add office</h2>
          {error === "invalid_office" ? (
            <p role="alert">Office name and slug are required.</p>
          ) : null}

          <form action={createOfficeAction}>
            <label>
              Office name
              <input name="name" required />
            </label>

            <label>
              Slug
              <input
                name="slug"
                required
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                title="Lowercase letters, numbers, and hyphens only."
              />
            </label>

            <label>
              Parent office
              <select name="parentOfficeId" defaultValue="">
                <option value="">Top level</option>
                {officeRecords.map((office) => (
                  <option key={office.id} value={office.id}>
                    {office.name}
                  </option>
                ))}
              </select>
            </label>

            <button type="submit">Create office</button>
          </form>
        </section>
      ) : null}

      <section>
        <h2>Authorization boundary</h2>
        <p>
          This page is populated only after an authenticated session resolves
          to an active organization membership. Organization and office access
          is evaluated from that membership&apos;s roles and permissions.
        </p>
      </section>
    </main>
  );
}
