import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const result = {
    image: null,
    digest: null,
    source: null,
    tag: null,
    out: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--image") result.image = value;
    else if (arg === "--digest") result.digest = value;
    else if (arg === "--source") result.source = value;
    else if (arg === "--tag") result.tag = value;
    else if (arg === "--out") result.out = value;
    else fail(`Unknown argument: ${arg}`);
    index += 1;
  }

  for (const [key, value] of Object.entries(result)) {
    if (!value) fail(`--${key} is required`);
  }

  return result;
}

const args = parseArgs(process.argv.slice(2));
const packageJson = JSON.parse(
  readFileSync(
    new URL("../package.json", import.meta.url),
    "utf8",
  ),
);

if (
  args.image !==
  "ghcr.io/neophilism/secure-intake-case-workflow-engine"
) {
  fail("Unexpected release image repository.");
}
if (!/^sha256:[a-f0-9]{64}$/i.test(args.digest)) {
  fail("Container digest must be sha256:<64 hex>.");
}
if (/^sha256:0{64}$/i.test(args.digest)) {
  fail("Container digest must not be all zeroes.");
}
if (!/^[a-f0-9]{40}$/i.test(args.source)) {
  fail("Source commit must be a 40-character Git SHA.");
}
if (args.tag !== `v${packageJson.version}`) {
  fail(
    `Release tag ${args.tag} does not match package version v${packageJson.version}.`,
  );
}

const evidence = {
  schemaVersion: 1,
  engine: {
    version: packageJson.version,
    sourceCommit: args.source,
    tag: args.tag,
  },
  container: {
    repository: args.image,
    digest: args.digest.toLowerCase(),
    immutableRef: `${args.image}@${args.digest.toLowerCase()}`,
  },
};

writeFileSync(
  resolve(args.out),
  JSON.stringify(evidence, null, 2) + "\n",
  "utf8",
);
