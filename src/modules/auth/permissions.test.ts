import { describe, expect, it } from "vitest";
import {
  corePermissions,
  defaultRoleTemplates,
} from "./permissions";

describe("default role templates", () => {
  it("uses unique role keys", () => {
    const keys = defaultRoleTemplates.map((role) => role.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("grants only declared core permissions", () => {
    const declared = new Set<string>(corePermissions);

    for (const role of defaultRoleTemplates) {
      for (const permission of role.permissions) {
        expect(declared.has(permission)).toBe(true);
      }
    }
  });

  it("keeps the submitter role intentionally minimal", () => {
    const submitter = defaultRoleTemplates.find(
      (role) => role.key === "submitter",
    );

    expect(submitter?.permissions).toEqual(["case:create"]);
  });
});
