import {
  assertTenantOwnership,
  type TenantScope,
} from "@/lib/tenancy";

export interface OfficeRecord {
  id: string;
  organizationId: string;
  name: string;
  parentOfficeId: string | null;
  status: string;
}

export interface OfficeTreeNode extends OfficeRecord {
  children: OfficeTreeNode[];
}

export class InvalidOfficeHierarchyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidOfficeHierarchyError";
  }
}

export function buildOfficeTree(
  scope: TenantScope,
  offices: readonly OfficeRecord[],
): OfficeTreeNode[] {
  for (const office of offices) {
    assertTenantOwnership(scope, office);
  }

  const nodes = new Map<string, OfficeTreeNode>(
    offices.map((office) => [office.id, { ...office, children: [] }]),
  );

  for (const node of nodes.values()) {
    if (!node.parentOfficeId) continue;

    const parent = nodes.get(node.parentOfficeId);
    if (!parent) {
      throw new InvalidOfficeHierarchyError(
        `Office ${node.id} references a parent outside the supplied tenant hierarchy.`,
      );
    }

    if (parent.id === node.id) {
      throw new InvalidOfficeHierarchyError(
        `Office ${node.id} cannot be its own parent.`,
      );
    }

    parent.children.push(node);
  }

  detectCycles(nodes);

  return [...nodes.values()]
    .filter((node) => !node.parentOfficeId)
    .sort(compareOffices)
    .map(sortChildren);
}

function detectCycles(nodes: Map<string, OfficeTreeNode>) {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (node: OfficeTreeNode) => {
    if (visiting.has(node.id)) {
      throw new InvalidOfficeHierarchyError(
        `Cycle detected in office hierarchy at ${node.id}.`,
      );
    }
    if (visited.has(node.id)) return;

    visiting.add(node.id);
    for (const child of node.children) visit(child);
    visiting.delete(node.id);
    visited.add(node.id);
  };

  for (const node of nodes.values()) visit(node);
}

function sortChildren(node: OfficeTreeNode): OfficeTreeNode {
  return {
    ...node,
    children: [...node.children].sort(compareOffices).map(sortChildren),
  };
}

function compareOffices(a: OfficeRecord, b: OfficeRecord) {
  return a.name.localeCompare(b.name);
}
