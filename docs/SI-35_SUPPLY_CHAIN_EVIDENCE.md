# SI-35 supply-chain evidence and unfinished gates

The Docker build context now excludes source-control metadata, locally held environment files, runtime document storage, package caches, build outputs and common private-key or database-backup artifacts. A deterministic Vitest assertion checks that the required exclusion patterns remain present. This reduces the chance of accidentally copying local secrets into builder and runtime layers.

This is **partial** supply-chain hardening, not proof of a reproducible build. The current repository contains no committed package-lock.json. Both CI and Docker currently use npm install, so transient dependency resolution can change builds. A complete SI-35 acceptance still requires a verified committed lockfile, npm ci for dependency installation, validated builder image digests, dependency/license security evidence, release artifact provenance/SBOM review, and matching exact-source CI. Do not assert these gates have passed based on a .dockerignore check.

The package-lock must be generated with trusted registry metadata in an isolated environment; do not invent transitive package versions or edit package integrity hashes manually. No production release is authorized by this change.
