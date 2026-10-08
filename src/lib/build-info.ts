import packageJson from "../../package.json";

export const engineBuildInfo = {
  service: "secure-intake-case-workflow-engine",
  version: packageJson.version,
} as const;
