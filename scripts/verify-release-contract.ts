import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { parseApplicationManifest } from "../src/modules/application/manifest";

async function main() {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  ) as {
    version?: string;
    scripts?: Record<string, string>;
  };

  assert.match(
    packageJson.version ?? "",
    /^1\.0\.0(?:-rc\.\d+)?$/,
    "Package version must be on the 1.0.0 release line.",
  );
  assert.equal(
    packageJson.scripts?.["test:integration"],
    "tsx integration/generic-contract.ts",
  );

  const manifestPath = new URL(
    "../examples/application-manifest.example.json",
    import.meta.url,
  );
  const rawManifest = await readFile(manifestPath, "utf8");
  const manifest = parseApplicationManifest(JSON.parse(rawManifest));

  assert.equal(manifest.application.key, "example_application");
  assert.equal(manifest.application.name, "Example Application");
  assert.ok(
    !/public integrity|whistleblower|declassification|surveillance|federal agency/i.test(
      rawManifest,
    ),
    "The bundled fixture must remain domain-neutral.",
  );

  assert.equal(
    manifest.forms.some((form) => form.slug === "example_form"),
    true,
  );
  const exampleForm = manifest.forms.find(
    (form) => form.slug === "example_form",
  );
  assert.equal(
    exampleForm?.definition.participantPortal?.enabled,
    true,
    "Neutral release fixture must exercise participant portal access.",
  );
  assert.equal(
    exampleForm?.definition.participantPortal?.messagingCondition?.fieldId,
    "example_contact_mode",
    "Neutral release fixture must exercise conditional participant messaging.",
  );
  const attachmentField = exampleForm?.definition.sections
    .flatMap((section) => section.fields)
    .find((field) => field.id === "example_attachment");
  assert.equal(
    attachmentField?.type,
    "file",
    "Neutral release fixture must exercise public attachment fields.",
  );
  assert.equal(
    attachmentField?.publicUpload?.documentTypeKey,
    "example_document",
    "Public attachment fixture must bind to a declared document type.",
  );
  assert.equal(
    manifest.workflows.some(
      (workflow) => workflow.slug === "example_workflow",
    ),
    true,
  );
  assert.equal(
    manifest.referralPolicies.some(
      (policy) => policy.key === "example_external_referral",
    ),
    true,
    "Neutral release fixture must exercise parallel referral policy.",
  );
  const referralPolicy = manifest.referralPolicies.find(
    (policy) => policy.key === "example_external_referral",
  );
  assert.deepEqual(
    new Set(
      referralPolicy?.definition.deadlinePolicies.map(
        (policy) => policy.key,
      ),
    ),
    new Set([
      "example_acknowledgment",
      "example_final_response",
    ]),
    "Neutral referral fixture must exercise independent milestone clocks.",
  );

  assert.equal(
    manifest.operationalViews.some(
      (view) => view.key === "example_open_work",
    ),
    true,
    "Neutral release fixture must exercise application operational views.",
  );
  assert.equal(
    manifest.operationalMetrics.some(
      (metric) => metric.key === "example_deadline_compliance",
    ),
    true,
    "Neutral release fixture must exercise deadline compliance metrics.",
  );
  assert.equal(
    manifest.operationalMetrics.some(
      (metric) => metric.key === "example_referral_compliance",
    ),
    true,
    "Neutral release fixture must exercise referral deadline metrics.",
  );

  try {
    await access(
      new URL("../examples/reference-app", import.meta.url),
      constants.F_OK,
    );
    assert.fail(
      "A domain-specific reference application must not be bundled in the engine repository.",
    );
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      // Expected: downstream applications live in separate repositories.
    } else {
      throw error;
    }
  }

  process.stdout.write(
    `Generic release contract valid for version ${packageJson.version}.\n`,
  );
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`Release contract verification failed:\n${message}\n`);
  process.exitCode = 1;
});
