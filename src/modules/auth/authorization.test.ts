import { describe, expect, it } from "vitest";
import { createTrustedTenantScope } from "@/lib/tenancy";
import {
  hasPermission,
  OrganizationSelectionRequiredError,
  PermissionDeniedError,
  requirePermission,
  type AuthorizationContext,
} from "./authorization";

function context(
  permissions: string[],
  withOrganization = true,
): AuthorizationContext {
  return {
    sessionId: "session_1",
    user: {
      id: "user_1",
      email: "user@example.test",
      displayName: "User",
    },
    membership: withOrganization
      ? { id: "membership_1", organizationId: "org_1", title: null }
      : null,
    tenantScope: withOrganization
      ? createTrustedTenantScope("org_1")
      : null,
    permissions: new Set(permissions),
    roleKeys: [],
  };
}

describe("authorization", () => {
  it("allows explicitly granted permissions", () => {
    const auth = context(["office:view"]);
    expect(hasPermission(auth, "office:view")).toBe(true);
    expect(() => requirePermission(auth, "office:view")).not.toThrow();
  });

  it("denies permissions that were not granted", () => {
    expect(() =>
      requirePermission(context(["office:view"]), "office:manage"),
    ).toThrow(PermissionDeniedError);
  });

  it("requires an active organization before tenant permissions apply", () => {
    expect(() =>
      requirePermission(context(["office:view"], false), "office:view"),
    ).toThrow(OrganizationSelectionRequiredError);
  });
});
