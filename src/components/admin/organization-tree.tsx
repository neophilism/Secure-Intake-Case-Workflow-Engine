import type { OfficeTreeNode } from "@/modules/organizations/office-tree";

export function OrganizationTree({
  offices,
}: {
  offices: readonly OfficeTreeNode[];
}) {
  if (offices.length === 0) {
    return <p>No offices have been configured for this organization.</p>;
  }

  return (
    <ul>
      {offices.map((office) => (
        <OfficeBranch key={office.id} office={office} />
      ))}
    </ul>
  );
}

function OfficeBranch({ office }: { office: OfficeTreeNode }) {
  return (
    <li>
      <strong>{office.name}</strong>
      {office.status !== "active" ? ` (${office.status})` : null}
      {office.children.length > 0 ? (
        <ul>
          {office.children.map((child) => (
            <OfficeBranch key={child.id} office={child} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
