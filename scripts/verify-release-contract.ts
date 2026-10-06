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
  assert.equal(
    manifest.workflows.some(
      (workflow) => workflow.slug === "example_workflow",
    ),
    true,
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
    } else if (error instanceof assert.AssertionError) {
      throw error;
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
