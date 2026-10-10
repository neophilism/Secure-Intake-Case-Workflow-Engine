/** Read-only, fail-closed release and database readiness smoke check. Node >=22. */
export function canonicalBaseUrl(input) {
  const u = new URL(input);
  if (u.protocol !== "https:" || u.username || u.password || u.port || u.pathname !== "/" || u.search || u.hash || !u.hostname || u.hostname === "localhost") {
    throw new Error("Smoke-check base URL must be a canonical HTTPS origin without credentials, port or path.");
  }
  return u.origin;
}
export async function probePublicService(baseUrl, fetcher = fetch, expectedVersion, timeoutMs = 45000) {
  const origin = canonicalBaseUrl(baseUrl);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60000) {
    throw new Error("Smoke-check timeout must be between 1000 and 60000 milliseconds.");
  }
  if (expectedVersion !== undefined && (typeof expectedVersion !== "string" || !/^[0-9]+\.[0-9]+\.[0-9]+(?:[-.][A-Za-z0-9.-]+)?$/.test(expectedVersion))) {
    throw new Error("Expected engine version must be a valid package version.");
  }
  const results = [];
  for (const [path, expectedCheck, expectedStatus] of [
    ["/api/health", "liveness", "ok"],
    ["/api/ready", "readiness", "ready"]
  ]) {
    const response = await fetcher(origin + path, {
      method: "GET", redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(timeoutMs)
    });
    const value = response.ok ? await response.json() : null;
    if (!response.ok || !value || value.status !== expectedStatus || value.check !== expectedCheck ||
        typeof value.version !== "string" || !value.version) {
      throw new Error(path + " did not satisfy the " + expectedCheck + " contract (HTTP " + response.status + ").");
    }
    if (path === "/api/ready" && value.checks?.database !== "ok") {
      throw new Error("Database readiness probe did not return ok.");
    }
    if (expectedVersion && value.version !== expectedVersion) {
      throw new Error(path + " reports version " + value.version + "; expected deployed version " + expectedVersion + ".");
    }
    results.push({ path, httpStatus: response.status, check: expectedCheck, version: value.version });
  }
  if (results[0].version !== results[1].version) throw new Error("Version mismatch between health and readiness.");
  return { origin, checks: results, status: "smoke_verified", checkedAt: new Date().toISOString() };
}
if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) {
  const baseUrl = process.argv[2];
  if (!baseUrl) {
    console.error("Usage: node scripts/probe-public.mjs https://YOUR-AUTHORIZED-SERVICE");
    process.exitCode = 2;
  } else {
    probePublicService(baseUrl, fetch, process.env.EXPECTED_ENGINE_VERSION || undefined).then(result => console.log(JSON.stringify(result))).catch(error => {
      console.error("Smoke check failed: " + (error instanceof Error ? error.message : "unknown error"));
      process.exitCode = 1;
    });
  }
}
