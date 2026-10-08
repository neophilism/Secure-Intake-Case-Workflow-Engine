# ADR 0032: Immutable container release evidence

## Status

Accepted for PR 30.

## Context

Production consumers pin the engine container by immutable SHA-256 digest rather
than by a mutable tag.

The release workflow already:

- verifies the release tag matches `package.json`;
- runs migrations, typecheck, release-contract checks, accessibility tests,
  unit tests, integration tests, and the production build;
- publishes the container to GHCR;
- emits provenance and an SBOM.

The missing promotion artifact was a small machine-readable record tying the
published container digest back to the exact source commit and package version.

Without that record, downstream deployment operators must manually transcribe a
digest from registry/UI output before generating infrastructure-as-code.

## Decision

Tagged releases now write `release-evidence.json` after the container push.

The evidence contains:

- schema version;
- package version;
- source commit SHA;
- release tag;
- container repository;
- container digest;
- immutable `repository@sha256:digest` reference.

The writer refuses:

- unexpected container repositories;
- malformed/non-SHA-256 digests;
- the all-zero placeholder digest;
- malformed source SHAs;
- release tags that do not exactly match `v<package version>`.

The release workflow uploads the JSON as a 90-day GitHub Actions artifact and
prints the immutable image reference in the workflow job summary.

Normal PR CI executes the writer with synthetic values so syntax/validation
regressions are caught before a release tag is pushed.

## Security

The evidence file contains no registry credential or application secret.

The digest is a content identifier, not an authorization token.

Downstream consumers should still verify that the release workflow completed
successfully and that the artifact came from the expected repository/tag.

## Deployment use

A downstream deployment can use:

`container.immutableRef`

as the exact image input for infrastructure generation.

This supports promotion workflows where source review, container publication,
and deployment configuration remain distinct auditable steps.

## Scope

This PR does not:

- sign the Git tag;
- add a separate container-signing key;
- replace GHCR provenance/SBOM attestations;
- create a GitHub Release object;
- deploy the image automatically.
