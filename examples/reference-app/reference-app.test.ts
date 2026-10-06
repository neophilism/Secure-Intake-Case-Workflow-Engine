import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseApplicationManifest } from "@/modules/application/manifest";

async function loadReferenceManifest() {
  return parseApplicationManifest(
    JSON.parse(
      await readFile(
        new URL("./application-manifest.json", import.meta.url),
        "utf8",
      ),
    ),
  );
}

describe("Public Integrity reference application", () => {
  it("validates as a portable application manifest", async () => {
    const manifest = await loadReferenceManifest();

    expect(manifest.application.key).toBe("public-integrity-demo");
    expect(manifest.forms.map((form) => form.slug)).toContain(
      "integrity-complaint",
    );
    expect(manifest.reviewPolicies.map((policy) => policy.key)).toContain(
      "initial_appeal",
    );
  });

  it("declares the complete reference lifecycle", async () => {
    const manifest = await loadReferenceManifest();
    const workflow = manifest.workflows.find(
      (candidate) => candidate.slug === "integrity_matter",
    );
    expect(workflow).toBeDefined();

    const states = new Set(
      workflow!.definition.states.map((state) => state.key),
    );
    expect(states).toEqual(
      expect.objectContaining(
        new Set([
          "submitted",
          "intake_screening",
          "investigation",
          "information_requested",
          "supervisor_review",
          "decided",
          "appeal_decided",
          "closed",
        ]),
      ),
    );

    const transitions = new Map(
      workflow!.definition.transitions.map((transition) => [
        transition.key,
        [transition.from, transition.to],
      ]),
    );
    expect(transitions.get("begin_screening")).toEqual([
      "submitted",
      "intake_screening",
    ]);
    expect(transitions.get("accept_for_investigation")).toEqual([
      "intake_screening",
      "investigation",
    ]);
    expect(transitions.get("request_information")).toEqual([
      "investigation",
      "information_requested",
    ]);
    expect(transitions.get("information_received")).toEqual([
      "information_requested",
      "investigation",
    ]);
    expect(transitions.get("submit_supervisor_review")).toEqual([
      "investigation",
      "supervisor_review",
    ]);
    expect(transitions.get("issue_decision")).toEqual([
      "supervisor_review",
      "decided",
    ]);
    expect(transitions.get("close_after_appeal")).toEqual([
      "appeal_decided",
      "closed",
    ]);
  });

  it("proves assignment, correspondence, deadlines, and appeal are configured", async () => {
    const manifest = await loadReferenceManifest();

    expect(
      manifest.queues.find((queue) => queue.slug === "investigations"),
    ).toMatchObject({
      teamSlug: "investigations",
      assignmentStrategy: "round_robin",
    });

    expect(
      manifest.routingRules.some(
        (rule) =>
          rule.targetQueueSlug === "investigations" &&
          rule.definition.conditions.some(
            (condition) => condition.field === "case_type",
          ),
      ),
    ).toBe(true);

    expect(
      manifest.communicationTemplates.map((template) => template.key),
    ).toEqual(
      expect.arrayContaining(["information_request", "decision_notice"]),
    );

    const workflow = manifest.workflows.find(
      (candidate) => candidate.slug === "integrity_matter",
    )!;
    expect(workflow.definition.deadlinePolicies.length).toBeGreaterThanOrEqual(3);

    const appeal = manifest.reviewPolicies.find(
      (policy) => policy.key === "initial_appeal",
    );
    expect(appeal).toMatchObject({
      level: 1,
      requireIndependentReviewer: true,
      eligibleCaseStatuses: ["decided"],
    });
    expect(appeal?.allowedOutcomes).toEqual(
      expect.arrayContaining(["affirmed", "modified", "reversed", "remanded"]),
    );
  });

  it("keeps all reference identities and sample contact data synthetic", async () => {
    const raw = await readFile(
      new URL("./seed.ts", import.meta.url),
      "utf8",
    );

    const emails = [...raw.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+/gi)].map(
      (match) => match[0].toLowerCase(),
    );

    expect(emails.length).toBeGreaterThan(0);
    expect(emails.every((email) => email.endsWith(".invalid"))).toBe(true);
    expect(raw).toContain('process.env.NODE_ENV === "production"');
  });
});
