import assert from "node:assert/strict";
import { canonicalBaseUrl, probePublicService } from "./probe-public.mjs";
const origin = "https://secure-intake.example.org";
assert.equal(canonicalBaseUrl(origin), origin);
for (const bad of ["http://secure-intake.example.org", "https://secure-intake.example.org/path", "https://u:p@secure-intake.example.org", "https://localhost", "https://secure-intake.example.org:8443"]) {
  assert.throws(() => canonicalBaseUrl(bad));
}
let seen = [];
const fake = async url => {
  seen.push(url);
  return Response.json(url.endsWith("/api/health")
    ? { status: "ok", check: "liveness", version: "1.0.0-rc.9" }
    : { status: "ready", check: "readiness", version: "1.0.0-rc.9", checks: { database: "ok" } });
};
const result = await probePublicService(origin, fake);
assert.equal(result.status, "smoke_verified");
assert.deepEqual(seen, [origin + "/api/health", origin + "/api/ready"]);
await assert.rejects(() => probePublicService(origin, async () => new Response("unavailable", { status: 503 })));
await assert.rejects(() => probePublicService(origin, async url => Response.json(url.endsWith("/api/health")
  ? { status: "ok", check: "liveness", version: "v" }
  : { status: "ready", check: "readiness", version: "v", checks: { database: "unavailable" } })));
console.info("Deployment smoke-check contract passed.");
