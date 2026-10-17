# Generic receipt content commitments

Shared primitive for the Secure Intake Engine, National Secure Ideas Submission, and Federal Electronic Filing & Receipt Portal.

`src/lib/receipt-commitment.ts` deterministically commits a bounded submission identifier, canonical UTC receipt timestamp, bounded authority identifier, body digest, and explicitly complete or incomplete attachment manifest. Identifiers are NFC-normalized and reject leading/trailing whitespace and control characters. Attachment ordering uses code-point order rather than locale collation, so the same accepted input produces the same bytes across supported runtimes.

The returned SHA-256 digest detects modification; it does not prove who recorded the manifest, that the date was trustworthy, that content was durably stored, or that a government agency received it.

Applications must implement and test authorization, durable transactional persistence, trustworthy time, separately signed receipts, key history, independent witness/verification and publication limits before claiming stronger assurances. Do not publicly expose identifying or sensitive input manifests simply to permit digest verification.

No Federal statute, agency concept, or National Secure Ideas terminology is embedded in the generic implementation.
