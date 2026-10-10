import assert from "node:assert/strict";
import { inspectProductionEnvironment } from "./verify-production-environment.mjs";
const valid = {
  DATABASE_URL: "postgresql://user:secret@neon.example.net/neondb?sslmode=require",
  APP_BASE_URL: "https://secure-intake-preview.onrender.com",
  DOCUMENT_STORAGE_DRIVER: "s3",
  DOCUMENT_S3_ENDPOINT: "https://storage.example.net",
  DOCUMENT_S3_REGION: "us-east-2",
  DOCUMENT_S3_BUCKET: "private-documents",
  DOCUMENT_S3_ACCESS_KEY_ID: "access-key",
  DOCUMENT_S3_SECRET_ACCESS_KEY: "secret-key",
  MALWARE_SCANNER_URL: "https://scanner.example.net/v1/scan",
  MALWARE_SCANNER_PROVIDER: "scanner",
  PROTECTED_DATA_ENCRYPTION_KEY: "a".repeat(32) + "b".repeat(32),
  WEBHOOK_ENCRYPTION_KEY: "b".repeat(32) + "a".repeat(32)
};
const result = inspectProductionEnvironment(valid);
assert.equal(result.ok, true, JSON.stringify(result));
assert.deepEqual(result.failed, []);
assert.deepEqual(result.warnings, []);
const missing = inspectProductionEnvironment({});
assert.equal(missing.ok, false);
assert(missing.failed.includes("database_tls_connection"));
assert(missing.failed.includes("https_malware_scanner"));
const bad = inspectProductionEnvironment({
  ...valid,
  DATABASE_URL: "postgres://root:secret@localhost/test",
  APP_BASE_URL: "http://secure-intake-preview.onrender.com",
  DOCUMENT_S3_ENDPOINT: "http://127.0.0.1:9000",
  MALWARE_SCANNER_URL: "http://scanner.example.net",
  PROTECTED_DATA_ENCRYPTION_KEY: "1".repeat(64)
});
assert.equal(bad.ok, false);
for (const check of ["database_tls_connection", "canonical_https_app_origin", "secure_s3_endpoint",
  "https_malware_scanner", "protected_data_encryption_key_format"]) assert(bad.failed.includes(check));
const partial = inspectProductionEnvironment({
  ...valid, PROTECTED_DATA_ENCRYPTION_KEY: undefined, WEBHOOK_ENCRYPTION_KEY: undefined
});
assert.equal(partial.ok, true);
assert.equal(partial.warnings.length, 2);
const text = JSON.stringify(inspectProductionEnvironment({
  ...valid, DATABASE_URL: "postgresql://user:very-secret-credential@localhost/neondb", DOCUMENT_S3_SECRET_ACCESS_KEY: "very-secret-credential"
}));
assert(!text.includes("very-secret-credential"), "Never report secret values.");
console.info("Deployment preflight checks passed.");
