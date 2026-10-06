import { OrganizationTree } from "@/components/admin/organization-tree";

export default function OrganizationAdministrationPage() {
  return (
    <main>
      <h1>Organization administration</h1>
      <p>
        Organizations, offices, memberships, invitations, and account status are
        now modeled as tenant-scoped platform primitives.
      </p>

      <section>
        <h2>Office hierarchy</h2>
        <OrganizationTree offices={[]} />
      </section>

      <section>
        <h2>Security boundary</h2>
        <p>
          Live organization data is intentionally not exposed from this route
          until PR 3 binds authenticated users and permissions to a trusted
          tenant scope. Client-supplied organization identifiers are not an
          authorization mechanism.
        </p>
      </section>
    </main>
  );
}
