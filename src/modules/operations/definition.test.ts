import { describe, expect, it } from "vitest";
import {
  caseSearchDefinitionFromSearchParams,
  caseSearchQueryString,
  parseCaseSearchDefinition,
} from "./definition";

describe("operational search definition", () => {
  it("normalizes bounded search parameters", () => {
    const parsed = caseSearchDefinitionFromSearchParams({
      q: " warrant ",
      status: "open,resolved",
      priority: "high",
      tag: "Urgent,urgent",
      focus: "overdue",
      sort: "created_desc",
      limit: "75",
    });

    expect(parsed.q).toBe("warrant");
    expect(parsed.statuses).toEqual(["open", "resolved"]);
    expect(parsed.tags).toEqual(["urgent"]);
    expect(parsed.focus).toBe("overdue");
    expect(parsed.limit).toBe(75);
  });

  it("round-trips query-string-safe saved views", () => {
    const definition = parseCaseSearchDefinition({
      q: "due process",
      statuses: ["open"],
      priorities: ["critical"],
      queueIds: [],
      assigneeMembershipIds: [],
      tags: ["constitutional"],
      focus: "mine",
      sort: "priority_desc",
      limit: 25,
    });

    const query = caseSearchQueryString(definition);
    const parsed = caseSearchDefinitionFromSearchParams(
      Object.fromEntries(new URLSearchParams(query)),
    );

    expect(parsed).toEqual(definition);
  });

  it("rejects unbounded saved-view definitions", () => {
    expect(() =>
      parseCaseSearchDefinition({
        statuses: [],
        priorities: [],
        queueIds: [],
        assigneeMembershipIds: [],
        tags: [],
        focus: "all",
        sort: "updated_desc",
        limit: 1000,
      }),
    ).toThrow();
  });
});
