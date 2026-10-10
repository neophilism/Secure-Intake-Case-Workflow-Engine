/** Pure fail-closed checks for a Neon + Render deployment. Never log secret values. */
function httpsOrigin(value) {
  if (typeof value !== "string") return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !!u.hostname && !u.username && !u.password &&
      !u.port && u.pathname === "/" && !u.search && !u.hash &&
      u.hostname !== "localhost" && !u.hostname.endsWith(".localhost");
  } catch { return false; }
}
function databaseUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const u = new URL(value);
    return ["postgres:", "postgresql:"].includes(u.protocol) && !!u.hostname &&
      !!u.username && !!u.password &&
      ["require", "verify-ca", "verify-full"].includes(u.searchParams.get("sslmode"));
  } catch { return false; }
}
function safeSecret(value) {
  return typeof value === "string" && value.length >= 4 &&
    !["example", "changeme", "replace-me", "placeholder", "password"].includes(value.toLowerCase());
}
function encryptionKey(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/i.test(value) && !/^([0-9a-f])\1{63}$/i.test(value);
}
export function inspectProductionEnvironment(env) {
  const failed = [];
  const warnings = [];
  const requireCheck = (name, ok) => { if (!ok) failed.push(name); };
  requireCheck("database_tls_connection", databaseUrl(env.DATABASE_URL));
  requireCheck("canonical_https_app_origin", httpsOrigin(env.APP_BASE_URL));
  requireCheck("private_durable_document_driver", env.DOCUMENT_STORAGE_DRIVER === "s3");
  requireCheck("secure_s3_endpoint", httpsOrigin(env.DOCUMENT_S3_ENDPOINT));
  requireCheck("s3_region", safeSecret(env.DOCUMENT_S3_REGION));
  requireCheck("s3_bucket", safeSecret(env.DOCUMENT_S3_BUCKET));
  requireCheck("s3_access_key_id", safeSecret(env.DOCUMENT_S3_ACCESS_KEY_ID));
  requireCheck("s3_secret_access_key", safeSecret(env.DOCUMENT_S3_SECRET_ACCESS_KEY));
  requireCheck("https_malware_scanner", httpsOrigin(env.MALWARE_SCANNER_URL));
  requireCheck("malware_scanner_provider", safeSecret(env.MALWARE_SCANNER_PROVIDER));
  if (env.PROTECTED_DATA_ENCRYPTION_KEY) {
    requireCheck("protected_data_encryption_key_format", encryptionKey(env.PROTECTED_DATA_ENCRYPTION_KEY));
  } else {
    warnings.push("protected_fields_unavailable_without_encryption_key");
  }
  if (env.WEBHOOK_ENCRYPTION_KEY) {
    requireCheck("webhook_encryption_key_format", encryptionKey(env.WEBHOOK_ENCRYPTION_KEY));
  } else {
    warnings.push("webhooks_unavailable_without_encryption_key");
  }
  return { ok: failed.length === 0, failed, warnings };
}
if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) {
  const result = inspectProductionEnvironment(process.env);
  console.log(JSON.stringify({
    status: result.ok ? "configuration_syntactically_valid" : "configuration_invalid",
    failedChecks: result.failed, warnings: result.warnings,
    limitations: "No network, storage, scanner, worker, authentication, migration, or backup was actually tested."
  }));
  if (!result.ok) process.exitCode = 1;
}
