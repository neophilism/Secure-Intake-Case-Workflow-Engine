import { describe, expect, it } from "vitest";
import { auditEventValues } from "./event";

describe("audit event values", () => {
  it("creates a bounded append-only event payload", () => {
    const event = auditEventValues({
      organizationId: "11111111-1111-1111-1111-111111111111",
      actorType: "user",
      actorUserId: "22222222-2222-2222-2222-222222222222",
      action: "case.transitioned",
      resourceType: "case",
      resourceId: "33333333-3333-3333-3333-333333333333",
      previousState: { status: "open" },
      newState: { status: "closed" },
    });

    expect(event.action).toBe("case.transitioned");
    expect(event.resourceType).toBe("case");
    expect(event.previousState).toEqual({ status: "open" });
    expect(event.newState).toEqual({ status: "closed" });
    expect(event.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("rejects unsafe action tokens", () => {
    expect(() =>
      auditEventValues({
        organizationId: "11111111-1111-1111-1111-111111111111",
        actorType: "system",
        action: "case changed",
        resourceType: "case",
        resourceId: "1",
      }),
    ).toThrow(/Invalid audit action/);
  });
});
