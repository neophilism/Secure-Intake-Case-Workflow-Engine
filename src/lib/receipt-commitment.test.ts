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
  it("rejects duplicate attachments, invalid hashes, and non-canonical timestamps", () => {
    expect(() => canonicalReceiptManifest({...original,documents:[...original.documents,...original.documents]})).toThrow();
    expect(() => canonicalReceiptManifest({...original,contentSha256:"bad"})).toThrow();
    for (const receivedAt of ["yesterday", "2026-02-30T12:30:00.000Z", "2026-10-14T12:30:00Z"]) {
      expect(() => canonicalReceiptManifest({...original,receivedAt})).toThrow();
    }
  });
  it("sorts by Unicode code points without locale-dependent collation", () => {
    const first = { id:"z",sha256:digestReceiptContent("Z"),sizeBytes:1,complete:true };
    const second = { id:"a",sha256:digestReceiptContent("A"),sizeBytes:1,complete:true };
    const a={...original,documents:[first,second]};
    const b={...original,documents:[second,first]};
    expect(createReceiptCommitment(a)).toEqual(createReceiptCommitment(b));
    expect(JSON.parse(canonicalReceiptManifest(a)).documents.map((item: {id: string}) => item.id)).toEqual(["a", "z"]);
  });
  it("normalizes identifiers before duplicate detection", () => {
    const composed = { id:"caf\u00e9",sha256:digestReceiptContent("A"),sizeBytes:1,complete:true };
    const decomposed = { ...composed, id:"cafe\u0301" };
    expect(() => canonicalReceiptManifest({...original,documents:[composed,decomposed]})).toThrow();
  });
  it("bounds identity and attachment manifests and rejects hidden controls", () => {
    expect(() => canonicalReceiptManifest({...original,submissionId:" padded"})).toThrow();
    expect(() => canonicalReceiptManifest({...original,authorityId:"bad\u0000authority"})).toThrow();
    expect(() => canonicalReceiptManifest({...original,documents:new Array(10_001).fill(original.documents[0])})).toThrow();
    expect(() => canonicalReceiptManifest({...original,documents:[{...original.documents[0],sizeBytes:Number.MAX_SAFE_INTEGER + 1}]})).toThrow();
  });
});
