import { describe, expect, it } from "vitest";
import type { AuditEvent } from "./contracts";

describe("shared contracts", () => {
  it("supports a stable audit-event envelope", () => {
    const event: AuditEvent = {
      id: "evt_01",
      occurredAt: "2026-10-05T00:00:00.000Z",
      actor: { id: "usr_01", type: "user", organizationId: "org_01" },
      action: "CASE_CREATED",
      resource: { id: "case_01", type: "case", organizationId: "org_01" },
      metadata: {},
    };

    expect(event.action).toBe("CASE_CREATED");
    expect(event.resource.organizationId).toBe("org_01");
  });
});
