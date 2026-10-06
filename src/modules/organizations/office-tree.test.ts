import { describe, expect, it } from "vitest";
import { createTrustedTenantScope, TenantBoundaryError } from "@/lib/tenancy";
import {
  buildOfficeTree,
  InvalidOfficeHierarchyError,
  type OfficeRecord,
} from "./office-tree";

const scope = createTrustedTenantScope("org_alpha");

function office(
  id: string,
  name: string,
  parentOfficeId: string | null = null,
): OfficeRecord {
  return {
    id,
    organizationId: "org_alpha",
    name,
    parentOfficeId,
    status: "active",
  };
}

describe("office hierarchy", () => {
  it("builds an organization-scoped hierarchy", () => {
    const tree = buildOfficeTree(scope, [
      office("hq", "Headquarters"),
      office("civil", "Civil Rights", "hq"),
      office("intake", "Intake", "civil"),
    ]);

    expect(tree).toHaveLength(1);
    expect(tree[0].children[0].id).toBe("civil");
    expect(tree[0].children[0].children[0].id).toBe("intake");
  });

  it("fails closed if another organization's office is supplied", () => {
    expect(() =>
      buildOfficeTree(scope, [
        office("hq", "Headquarters"),
        {
          ...office("foreign", "Foreign"),
          organizationId: "org_bravo",
        },
      ]),
    ).toThrow(TenantBoundaryError);
  });

  it("rejects orphaned parent references", () => {
    expect(() =>
      buildOfficeTree(scope, [office("intake", "Intake", "missing")]),
    ).toThrow(InvalidOfficeHierarchyError);
  });

  it("rejects cycles", () => {
    expect(() =>
      buildOfficeTree(scope, [
        office("a", "A", "b"),
        office("b", "B", "a"),
      ]),
    ).toThrow(InvalidOfficeHierarchyError);
  });
});
