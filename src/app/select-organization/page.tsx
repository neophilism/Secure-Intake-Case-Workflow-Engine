import { redirect } from "next/navigation";
import { getRuntimeDatabase } from "@/db/runtime";
import { listActiveMembershipsForUser } from "@/modules/auth/repository";
import { getCurrentAuthorizationContext } from "@/modules/auth/server-session";
import { selectOrganizationAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function SelectOrganizationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const context = await getCurrentAuthorizationContext();
  if (!context) {
    redirect("/login");
  }

  const { error } = await searchParams;
  const memberships = await listActiveMembershipsForUser(
    getRuntimeDatabase(),
    context.user.id,
  );

  if (
    memberships.length === 1 &&
    context.membership?.organizationId === memberships[0].organizationId
  ) {
    redirect("/admin/organizations");
  }

  return (
    <main>
      <h1>Select organization</h1>
      <p>
        Your permissions are evaluated independently inside each organization.
      </p>

      {error === "not_authorized" ? (
        <p role="alert">
          That organization is not available to your active account.
        </p>
      ) : null}

      {memberships.length === 0 ? (
        <p>No active organization memberships are available.</p>
      ) : (
        <ul>
          {memberships.map((membership) => (
            <li key={membership.id}>
              <form action={selectOrganizationAction}>
                <input
                  type="hidden"
                  name="organizationId"
                  value={membership.organizationId}
                />
                <button type="submit">
                  {membership.organizationName}
                  {membership.title ? ` — ${membership.title}` : ""}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
