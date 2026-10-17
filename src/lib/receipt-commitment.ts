import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Generic immutable-content commitment shared by downstream intake applications.
 * This is NOT a signature, proof of governmental receipt or a clock attestation.
 * Signing, trusted time and durable commit must be supplied by an authorized host.
 */
export interface ReceiptDocumentCommitment {
  id: string;
  sha256: string;
  sizeBytes: number;
  complete: boolean;
}

export interface ReceiptInput {
  submissionId: string;
  receivedAt: string;
  authorityId: string;
  contentSha256: string;
  documents: ReceiptDocumentCommitment[];
}

export interface ReceiptCommitment {
  schemaVersion: 1;
  algorithm: "sha256";
  manifestSha256: string;
}

const digestPattern = /^[0-9a-f]{64}$/;
const canonicalUtcPattern = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/;
const controlPattern = /[\u0000-\u001f\u007f]/;
const maxDocuments = 10_000;
const maxIdentifierBytes = 512;

export function digestReceiptContent(content: Uint8Array | string): string {
  return createHash("sha256").update(content).digest("hex");
}

function canonicalIdentifier(value: unknown): string {
  if (typeof value !== "string" || value !== value.trim() || controlPattern.test(value)) {
    throw new Error("Invalid receipt identity");
  }
  const normalized = value.normalize("NFC");
  if (!normalized || Buffer.byteLength(normalized, "utf8") > maxIdentifierBytes) {
    throw new Error("Invalid receipt identity");
  }
  return normalized;
}

/** Canonical serialization has an explicit fixed order and rejects ambiguous inputs. */
export function canonicalReceiptManifest(input: ReceiptInput): string {
  if (!input || typeof input !== "object") throw new Error("Invalid receipt input");
  const submissionId = canonicalIdentifier(input.submissionId);
  const authorityId = canonicalIdentifier(input.authorityId);
  if (!canonicalUtcPattern.test(input.receivedAt) ||
      new Date(input.receivedAt).toISOString() !== input.receivedAt) {
    throw new Error("Invalid canonical UTC receipt time");
  }
  if (!digestPattern.test(input.contentSha256)) throw new Error("Invalid content digest");
  if (!Array.isArray(input.documents) || input.documents.length > maxDocuments) {
    throw new Error("Invalid document manifest");
  }
  const seen = new Set<string>();
  const documents = input.documents.map(doc => {
    if (!doc || typeof doc !== "object") throw new Error("Invalid document commitment");
    const id = canonicalIdentifier(doc.id);
    if (seen.has(id) || !digestPattern.test(doc.sha256) ||
        !Number.isSafeInteger(doc.sizeBytes) || doc.sizeBytes < 0 || typeof doc.complete !== "boolean") {
      throw new Error("Invalid or duplicate document commitment");
    }
    seen.add(id);
    return { id, sha256: doc.sha256, sizeBytes: doc.sizeBytes, complete: doc.complete };
  }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return JSON.stringify({
    schemaVersion: 1,
    submissionId,
    receivedAt: input.receivedAt,
    authorityId,
    contentSha256: input.contentSha256,
    documents,
  });
}

export function createReceiptCommitment(input: ReceiptInput): ReceiptCommitment {
  return { schemaVersion: 1, algorithm: "sha256", manifestSha256: digestReceiptContent(canonicalReceiptManifest(input)) };
}

export function verifyReceiptCommitment(input: ReceiptInput, commitment: ReceiptCommitment): boolean {
  if (!commitment || commitment.schemaVersion !== 1 || commitment.algorithm !== "sha256" ||
      !digestPattern.test(commitment.manifestSha256)) return false;
  const expected = Buffer.from(createReceiptCommitment(input).manifestSha256, "hex");
  const observed = Buffer.from(commitment.manifestSha256, "hex");
  return timingSafeEqual(expected, observed);
}
