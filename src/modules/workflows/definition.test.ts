import { describe, expect, it } from "vitest";
import { defaultCaseWorkflowDefinition } from "./default-workflow";
import { parseWorkflowDefinition } from "./definition";

describe("workflow definition", () => {
  it("parses the default lifecycle as a valid workflow", () => {
    expect(defaultCaseWorkflowDefinition.initialState).toBe(
      "intake_review",
    );
    expect(defaultCaseWorkflowDefinition.transitions.length).toBe(10);
  });

  it("rejects duplicate state keys", () => {
    expect(() =>
      parseWorkflowDefinition({
        schemaVersion: 1,
        initialState: "one",
        states: [
          { key: "one", label: "One" },
          { key: "one", label: "Duplicate" },
        ],
        transitions: [],
      }),
    ).toThrow(/Duplicate state key/);
  });

  it("rejects transitions that reference unknown states", () => {
    expect(() =>
      parseWorkflowDefinition({
        schemaVersion: 1,
        initialState: "one",
        states: [{ key: "one", label: "One" }],
        transitions: [
          {
            key: "advance",
            label: "Advance",
            from: "one",
            to: "missing",
            requiredPermissions: ["case:update"],
          },
        ],
      }),
    ).toThrow(/Unknown transition target state/);
  });

  it("requires every transition to name at least one permission", () => {
    expect(() =>
      parseWorkflowDefinition({
        schemaVersion: 1,
        initialState: "one",
        states: [
          { key: "one", label: "One" },
          { key: "two", label: "Two" },
        ],
        transitions: [
          {
            key: "advance",
            label: "Advance",
            from: "one",
            to: "two",
            requiredPermissions: [],
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects no-op transitions", () => {
    expect(() =>
      parseWorkflowDefinition({
        schemaVersion: 1,
        initialState: "one",
        states: [{ key: "one", label: "One" }],
        transitions: [
          {
            key: "stay",
            label: "Stay",
            from: "one",
            to: "one",
            requiredPermissions: ["case:update"],
          },
        ],
      }),
    ).toThrow(/must change state/);
  });
});
