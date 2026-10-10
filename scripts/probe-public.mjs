/** Read-only, fail-closed release and database readiness smoke check. Node >=22. */
export function canonicalBaseUrl(input) {
  const u = new URL(input);
  if (u.protocol !== "https:" || u.username || u.password || u.port || u.pathname !== "/" || u.search || u.hash || !u.hostname || u.hostname === "localhost") {
    throw new Error("Smoke-check base URL must be a canonical HTTPS origin without credentials, port or path.");
  }
  return u.origin;
}
export async function probePublicService(baseUrl, fetcher = fetch) {
  const origin = canonicalBaseUrl(baseUrl);
  const results = [];
  for (const [path, expectedCheck, expectedStatus] of [
    ["/api/health", "liveness", "ok"],
    ["/api/ready", "readiness", "ready"]
  ]) {
    const response = await fetcher(origin + path, {
      method: "GET", redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(12000)
    });
    const value = response.ok ? await response.json() : null;
    if (!response.ok || !value || value.status !== expectedStatus || value.check !== expectedCheck ||
        typeof value.version !== "string" || !value.version) {
      throw new Error(path + " did not satisfy the " + expectedCheck + " contract (HTTP " + response.status + ").");
    }
    if (path === "/api/ready" && value.checks?.database !== "ok") {
      throw new Error("Database readiness probe did not return ok.");
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
    probePublicService(baseUrl).then(result => console.log(JSON.stringify(result))).catch(error => {
      console.error("Smoke check failed: " + (error instanceof Error ? error.message : "unknown error"));
      process.exitCode = 1;
    });
  }
}
