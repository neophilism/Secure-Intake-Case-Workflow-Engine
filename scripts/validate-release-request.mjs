import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const result = { file: null, githubOutput: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--file") {
      result.file = argv[++index] ?? null;
    } else if (arg === "--github-output") {
      result.githubOutput = argv[++index] ?? null;
    } else {
      fail(`Unknown argument: ${arg}`);
    }
  }
  if (!result.file) fail("--file is required");
  return result;
}

const args = parseArgs(process.argv.slice(2));
const request = JSON.parse(
  readFileSync(resolve(args.file), "utf8"),
);

if (request.schemaVersion !== 1) {
  fail("Release request schemaVersion must be 1.");
}
if (
  typeof request.version !== "string" ||
  !/^[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9.-]+)?$/.test(
    request.version,
  )
) {
  fail("Release request version is invalid.");
}
if (
  typeof request.sourceRef !== "string" ||
  !/^[a-f0-9]{40}$/i.test(request.sourceRef)
) {
  fail(
    "Release request sourceRef must be an immutable 40-character Git SHA.",
  );
}

const packageVersion = JSON.parse(
  readFileSync(
    new URL("../package.json", import.meta.url),
    "utf8",
  ),
).version;

if (request.version !== packageVersion) {
  fail(
    `Release request version ${request.version} does not match package version ${packageVersion}.`,
  );
}

if (args.githubOutput) {
  const outputPath = resolve(args.githubOutput);
  const lines = [
    `version=${request.version}`,
    `source_ref=${request.sourceRef.toLowerCase()}`,
  ];
  const { appendFileSync } = await import("node:fs");
  appendFileSync(outputPath, lines.join("\n") + "\n", "utf8");
} else {
  process.stdout.write(
    JSON.stringify(
      {
        version: request.version,
        sourceRef: request.sourceRef.toLowerCase(),
      },
      null,
      2,
    ) + "\n",
  );
}
