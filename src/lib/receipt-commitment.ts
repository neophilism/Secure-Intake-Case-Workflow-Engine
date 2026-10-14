import { createHash } from "node:crypto";

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

export function digestReceiptContent(content: Uint8Array | string): string {
  return createHash("sha256").update(content).digest("hex");
}

/** Canonical serialization has an explicit fixed order and rejects ambiguous inputs. */
export function canonicalReceiptManifest(input: ReceiptInput): string {
  if (!input.submissionId.trim() || !input.authorityId.trim()) throw new Error("Missing receipt identity");
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,3})?Z$/.test(input.receivedAt) ||
      !Number.isFinite(Date.parse(input.receivedAt))) throw new Error("Invalid UTC receipt time");
  if (!digestPattern.test(input.contentSha256)) throw new Error("Invalid content digest");
  const seen = new Set<string>();
  const documents = input.documents.map(doc => {
    if (!doc.id.trim() || seen.has(doc.id) || !digestPattern.test(doc.sha256) ||
        !Number.isSafeInteger(doc.sizeBytes) || doc.sizeBytes < 0 || typeof doc.complete !== "boolean") {
      throw new Error("Invalid or duplicate document commitment");
    }
    seen.add(doc.id);
    return { id: doc.id, sha256: doc.sha256, sizeBytes: doc.sizeBytes, complete: doc.complete };
  }).sort((a,b)=>a.id.localeCompare(b.id,"en"));
  return JSON.stringify({
    schemaVersion: 1,
    submissionId: input.submissionId,
    receivedAt: input.receivedAt,
    authorityId: input.authorityId,
    contentSha256: input.contentSha256,
    documents,
  });
}

export function createReceiptCommitment(input: ReceiptInput): ReceiptCommitment {
  return { schemaVersion: 1, algorithm: "sha256", manifestSha256: digestReceiptContent(canonicalReceiptManifest(input)) };
}

export function verifyReceiptCommitment(input: ReceiptInput, commitment: ReceiptCommitment): boolean {
  if (commitment.schemaVersion !== 1 || commitment.algorithm !== "sha256" ||
      !digestPattern.test(commitment.manifestSha256)) return false;
  return createReceiptCommitment(input).manifestSha256 === commitment.manifestSha256;
}
