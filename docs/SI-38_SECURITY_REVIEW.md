# SI-38 scoped security review

This is a source review of form-answer handling and selected protected-data boundaries. It is not a full E2EESA inventory, independent review, provider test or conformance claim. The canonical status in `security/e2eesa-status.json` remains authoritative.

## Reviewed paths and trust boundaries

| Flow | Source checked | Boundary |
| --- | --- | --- |
| Browser form values into answer maps | `src/modules/forms/form-data.ts`, `visibility.ts`, `validation.ts` | Untrusted client values become validated submission data. |
| Form definitions and conditional fields | `src/modules/forms/definition.ts` | Authorized definitions choose field IDs and visibility conditions. |
| Protected field segregation | `src/modules/protected-data/answers.ts`, `crypto.ts` | Server separates selected answers and encrypts them with a server-held key. |
| One-time protected reveal | `src/modules/protected-data/service.ts`, `src/app/admin/protected/reveal/[requestId]/route.ts` | Authenticated, tenant-scoped, dual-control request reveals plaintext to an authorized operator. |

## Finding SI38-01: inherited answer keys

The identifier grammar permits `constructor` as a field ID. An empty ordinary JavaScript object inherits `constructor` from `Object.prototype`. Conditional visibility and field validation previously read `answers[field.id]` without checking ownership, so an omitted `constructor` answer could appear present and produce a spurious required-field or type error.

The fix checks `Object.prototype.hasOwnProperty.call` before these reads. The regression exercises browser `FormData` parsing through validation with an absent `constructor` field, then confirms that an explicitly submitted value still activates its condition. This preserves existing valid field IDs without changing stored definitions.

## Remaining E2EESA work

- Complete the application component and data-flow inventory, including authentication, public disclosure, S3 storage, scanner plaintext transfer, notifications, webhooks, keys, build artifacts and provider operations.
- Test tenant and role boundaries, key custody and rotation, backup restoration, endpoint egress controls, and real provider behavior against exact source and deployment identities.
- Keep implementation, automated testing and independent review statuses separate. Server-held AES-GCM and TLS do not establish end-to-end encryption of content from the submitter to recipients.
- Leave conformance and certification claims pending until the applicable standard's evidence and review requirements are met.
