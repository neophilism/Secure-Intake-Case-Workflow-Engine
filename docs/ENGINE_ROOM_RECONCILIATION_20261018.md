# Source plan and dependency reconciliation — 18 October 2026

Reviewed engine source: `eaa76f6832cc9f99e0bf18590b0bbbbd6b1f7b7f`. Current package version: `1.0.0-rc.9`; this is a prerelease, not a verified stable 1.0 deployment.

The GitHub observation contains **42 PRs, 0 open, 42 closed, 41 merged and 1 closed without merge**. The closed-unmerged PR is #32; it must never count as implemented work. The canonical plan previously mapped only its first 27 units despite additional merged implementation. Actual PR counters and plan mappings are separate facts.

## Resolve the seven grouped slots from explicit source evidence

The governing plan explicitly refers SI-28–34 to ADRs 0028–0034. The ADR status text names the accepted implementation PR, so these mappings do not guess PR numbers from unit positions.

| Stable unit | Source definition | Full-scope implementation PR | Note |
| --- | --- | --- | --- |
| SI-28 | ADR 0028 parallel case referrals | #26 | Overlaps historical SI-26; retain both stable plan IDs and disclose that the plan contains overlap |
| SI-29 | ADR 0029 application operational views | #27 | Overlaps historical SI-27; retain provenance rather than invent a new capability |
| SI-30 | ADR 0030 durable storage and scanning | #28 | `src/modules/documents/storage-s3.ts`, scanner/queue behavior and tests |
| SI-31 | ADR 0031 liveness/readiness | #29 | `src/lib/readiness.ts`, readiness route and tests |
| SI-32 | ADR 0032 immutable release evidence | #31 | #30 merged into an intermediate branch; #31 explicitly consolidates the implementation on main. Retain #30 as prior evidence, not a second required release ancestor; #32 was closed unmerged |
| SI-33 | ADR 0033 validated release dispatch | #33 | Release workflow and contract validation |
| SI-34 | ADR 0034 immutable release-request dispatch | #34 | Request validator and automated dispatch workflow |

This changes missing mappings into source-supported capability mappings. It does not establish stable-release readiness. The duplicate historical plan slots are explicitly marked overlapping; their fraction is unsuitable as an estimate of application completion. Removing/redefining historic approved IDs is not silently performed by a tracker repair.

## Further implementation versus stable production evidence

PRs #35–38 supply immutable deployment contracts, existing-deployment monitoring, secret-safe preflight and bounded readiness diagnosis. They contribute to broader SI-35–40 scope; their existence does not prove a completed supply-chain/production/durability/security/notification/monitoring package. #40 records security implementation/testing status; recording a status is not conformance. #43 adds tested generic receipt content commitments and contributes to provenance/audit scope; it is not a stable 1.0 release.

SI-42 now explicitly depends on the preceding production/security/release units. Stable 1.0 still requires their full-scoped source evidence, an actual stable release, compatible downstream integration and current deployment/end-to-end acceptance. Deferred external human auditing does not stop routine implementation. Missing actual controls, source evidence or configured providers remain distinct facts to resolve.

Typecheck and 22 focused source tests passed during review: referrals, operational views, durable storage, scanner, readiness and receipt commitments. The proposed source reconciliation runs the existing full CI, including PostgreSQL integration, release-contract checks, production build and container build. No deployment, provider configuration or sensitive live-data action was performed for this audit.

The historical National Secure Ideas application consumed this engine's pinned release candidate while both repositories evolved. Historical accepted PRs remain accepted; future downstream completion cannot be asserted merely because its local PRs merged.
