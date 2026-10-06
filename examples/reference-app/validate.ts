import { readFile } from "node:fs/promises";
import { parseApplicationManifest } from "../../src/modules/application/manifest";

async function main() {
  const manifest = parseApplicationManifest(
    JSON.parse(
      await readFile(
        new URL("./application-manifest.json", import.meta.url),
        "utf8",
      ),
    ),
  );

  const workflow = manifest.workflows.find(
    (candidate) => candidate.slug === "integrity_matter",
  );
  if (!workflow) throw new Error("integrity_matter workflow is required.");

  const requiredStates = [
    "submitted",
    "intake_screening",
    "investigation",
    "information_requested",
    "supervisor_review",
    "decided",
    "appeal_decided",
    "closed",
  ];
  const states = new Set(
    workflow.definition.states.map((state) => state.key),
  );
  for (const state of requiredStates) {
    if (!states.has(state)) {
      throw new Error(`Reference workflow is missing state: ${state}`);
    }
  }

  const requiredTransitions = [
    "begin_screening",
    "accept_for_investigation",
    "request_information",
    "information_received",
    "submit_supervisor_review",
    "issue_decision",
    "close_after_appeal",
  ];
  const transitions = new Set(
    workflow.definition.transitions.map(
      (transition) => transition.key,
    ),
  );
  for (const transition of requiredTransitions) {
    if (!transitions.has(transition)) {
      throw new Error(
        `Reference workflow is missing transition: ${transition}`,
      );
    }
  }

  if (
    !manifest.reviewPolicies.some(
      (policy) => policy.key === "initial_appeal",
    )
  ) {
    throw new Error("Reference application must declare an appeal policy.");
  }

  process.stdout.write(
    `Valid end-to-end reference application: ${manifest.application.name}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Reference application validation failed: ${
      error instanceof Error ? error.message : "Unknown validation error."
    }\n`,
  );
  process.exitCode = 1;
});
