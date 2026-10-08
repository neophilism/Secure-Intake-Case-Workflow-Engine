# ADR 0033: One-click validated release dispatch

## Status

Accepted for PR 33.

## Context

The engine release workflow already performs the full release validation chain
and publishes an immutable GHCR image with provenance, SBOM and
`release-evidence.json`.

The remaining operational friction was tag creation. The connected automation
environment can review and modify GitHub repositories but cannot create Git tags
or dispatch workflows directly.

A manual operator should not need to reproduce the release validation locally or
construct a tag by hand.

GitHub Actions also suppresses follow-on workflow triggers for refs pushed using
the same workflow's `GITHUB_TOKEN`. A design where a manual workflow merely
pushes a tag and expects a second tag-triggered workflow would therefore be
incorrect.

## Decision

The release workflow supports both:

- existing `push.tags: v*` releases; and
- `workflow_dispatch` with:
  - `version`;
  - `source_ref`.

For a manual dispatch, the workflow itself performs the complete release:

1. checks out the requested source ref;
2. resolves the exact source commit;
3. requires the requested version to equal `package.json`;
4. requires the release tag to be exactly `v<package version>`;
5. checks whether that tag already exists;
6. allows a retry only when the existing tag resolves to the same source commit;
7. runs audit, migration, typecheck, release-contract, accessibility, unit,
   integration and production-build checks;
8. creates the annotated release tag after validation if it does not already
   exist;
9. pushes the GHCR image;
10. emits provenance and SBOM;
11. writes and uploads immutable release evidence.

The image tag is derived from the validated package version rather than relying
on `github.ref_name`, allowing manual and tag-triggered release paths to share
the same publication logic.

## Retry behavior

A manual release may be rerun if the release tag already exists at the exact
same source commit.

The workflow fails if the tag exists at a different commit.

This makes retries safe without allowing a release tag to be silently moved.

## Security

The workflow uses GitHub's scoped `GITHUB_TOKEN`.

Required permissions:

- `contents: write` for annotated tag creation;
- `packages: write` for GHCR publication.

No long-lived personal access token is introduced.

Release evidence continues to bind:

- package version;
- exact source commit;
- release tag;
- container repository;
- immutable SHA-256 digest.

## Scope

This PR does not automatically deploy the released image.

Production deployment remains a separate downstream promotion step driven by
verified `release-evidence.json`.
