import { describe, expect, it } from "vitest";
import {
  assertTenantOwnership,
  createTrustedTenantScope,
  selectTenantOwned,
  TenantBoundaryError,
} from "./tenancy";

describe("tenant boundary", () => {
  const alpha = createTrustedTenantScope("org_alpha");

  it("accepts resources owned by the active organization", () => {
    const resource = { id: "case_1", organizationId: "org_alpha" };
    expect(assertTenantOwnership(alpha, resource)).toBe(resource);
  });

  it("rejects cross-organization resources", () => {
    expect(() =>
      assertTenantOwnership(alpha, {
        id: "case_2",
        organizationId: "org_bravo",
      }),
    ).toThrow(TenantBoundaryError);
  });

  it("filters collections to the active organization", () => {
    const visible = selectTenantOwned(alpha, [
      { id: "1", organizationId: "org_alpha" },
      { id: "2", organizationId: "org_bravo" },
      { id: "3", organizationId: "org_alpha" },
    ]);

    expect(visible.map((item) => item.id)).toEqual(["1", "3"]);
  });

  it("refuses an empty trusted scope", () => {
    expect(() => createTrustedTenantScope("")).toThrow(
      "organizationId is required",
    );
  });
});
