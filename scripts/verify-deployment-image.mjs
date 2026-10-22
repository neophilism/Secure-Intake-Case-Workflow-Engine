import { readFileSync } from "node:fs";

const expectedRepository = "ghcr.io/neophilism/secure-intake-case-workflow-engine";
const shaPattern = /^[a-f0-9]{40}$/i;
const digestPattern = /^sha256:[a-f0-9]{64}$/i;

export function verifyDeploymentImage(evidence, expectedSource, blueprintText) {
  const failed = [];
  const validEvidence = evidence?.schemaVersion === 1 &&
    shaPattern.test(evidence?.engine?.sourceCommit ?? "") &&
    evidence?.engine?.sourceCommit === expectedSource &&
    evidence?.engine?.tag === `v${evidence?.engine?.version}` &&
    evidence?.container?.repository === expectedRepository &&
    digestPattern.test(evidence?.container?.digest ?? "") &&
    !/^sha256:0{64}$/i.test(evidence?.container?.digest ?? "") &&
    evidence?.container?.immutableRef ===
      `${expectedRepository}@${evidence?.container?.digest}`;
  if (!shaPattern.test(expectedSource) || evidence?.engine?.sourceCommit !== expectedSource) {
    failed.push("source_commit");
  }
  if (!validEvidence) failed.push("release_evidence");

  const imageLines = [...String(blueprintText).matchAll(/^\s*image:\s*(\S+)\s*$/gm)];
  if (imageLines.length !== 1 ||
      !validEvidence || imageLines[0][1] !== evidence.container.immutableRef) {
    failed.push("blueprint_image");
  }
  return { ok: failed.length === 0, failed };
}

if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) {
  const args = process.argv.slice(2);
  const getArg = key => args[args.indexOf(key) + 1];
  if (args.length !== 6 || !["--evidence", "--source", "--blueprint"].every(key => args.includes(key))) {
    console.error("Usage: node scripts/verify-deployment-image.mjs --evidence FILE --source SHA --blueprint FILE");
    process.exitCode = 2;
  } else {
    const result = verifyDeploymentImage(
      JSON.parse(readFileSync(getArg("--evidence"), "utf8")),
      getArg("--source"),
      readFileSync(getArg("--blueprint"), "utf8")
    );
    console.log(JSON.stringify(result));
    if (!result.ok) process.exitCode = 1;
  }
}
