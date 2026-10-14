import { describe, expect, it } from "vitest";
import { canonicalReceiptManifest, createReceiptCommitment, digestReceiptContent, verifyReceiptCommitment } from "./receipt-commitment";

const original = {
  submissionId: "submission-1",
  receivedAt: "2026-10-14T12:30:00.000Z",
  authorityId: "demo-not-a-government-authority",
  contentSha256: digestReceiptContent("Test content"),
  documents: [{ id: "attachment-b", sha256: digestReceiptContent("File"), sizeBytes: 4, complete: true }],
};

describe("generic receipt content commitments", () => {
  it("produces repeatable deterministic SHA-256 manifest commitments", () => {
    expect(createReceiptCommitment(original)).toEqual(createReceiptCommitment(structuredClone(original)));
    expect(verifyReceiptCommitment(original, createReceiptCommitment(original))).toBe(true);
  });
  it("detects changed content and inaccurate attachment completeness", () => {
    const commitment = createReceiptCommitment(original);
    expect(verifyReceiptCommitment({ ...original, contentSha256: digestReceiptContent("Modified") }, commitment)).toBe(false);
    expect(verifyReceiptCommitment({ ...original, documents:[{...original.documents[0], complete:false}] }, commitment)).toBe(false);
  });
  it("rejects duplicate attachments, invalid hashes, and invalid timestamps", () => {
    expect(() => canonicalReceiptManifest({...original,documents:[...original.documents,...original.documents]})).toThrow();
    expect(() => canonicalReceiptManifest({...original,contentSha256:"bad"})).toThrow();
    expect(() => canonicalReceiptManifest({...original,receivedAt:"yesterday"})).toThrow();
  });
  it("never confuses attachment ordering with a changed manifest", () => {
    const second = { id:"attachment-a",sha256:digestReceiptContent("A"),sizeBytes:1,complete:true };
    const a={...original,documents:[original.documents[0],second]};
    const b={...original,documents:[second,original.documents[0]]};
    expect(createReceiptCommitment(a)).toEqual(createReceiptCommitment(b));
  });
});
