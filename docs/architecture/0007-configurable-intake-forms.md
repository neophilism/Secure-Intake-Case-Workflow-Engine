# ADR 0007: Configurable, versioned intake forms

## Status
Accepted for PR 4.

## Decision

Intake forms are configuration, not application code.

A stable `intake_form` owns one or more immutable numbered form versions. Staff may create draft versions; publishing a draft supersedes the previously published version. Existing submissions remain pinned to the exact version used when the submission was created.

This prevents later edits from silently changing the interpretation of historical intake data.

## Definition schema

Version 1 of the generic definition supports:

- short and long text;
- email and phone;
- dates and numbers;
- booleans;
- single- and multi-select options;
- addresses;
- attestations;
- attachment-reference fields;
- sections;
- required/optional fields;
- help text and placeholders;
- length, numeric, and regular-expression constraints;
- conditional visibility.

Field and section identifiers are stable machine identifiers. Definitions reject duplicate IDs, invalid references, self-dependent conditions, invalid regular expressions, and malformed option sets.

## Conditional fields

Visibility is evaluated from submitted answers. A required field is required only while visible. Hidden values are not granted any special authority; all answers are filtered to field IDs declared by the form before persistence.

## Public and authenticated forms

A form declares an access mode. The generic public route resolves only:

1. an active organization;
2. an active form;
3. `access_mode = public`; and
4. a published version.

The route's organization/form slugs identify a public resource; they do not establish tenant authorization.

Authenticated-only forms are represented in the same model but require a downstream authenticated surface before use.

## Draft submissions

Anonymous resumable drafts use a high-entropy opaque resume token. Only a SHA-256 hash of the token is stored. Draft validation permits missing required fields but still rejects malformed supplied values.

Submission completion performs full validation and clears the draft token hash.

## Confirmation codes

A confirmation code is a receipt identifier, not an authentication secret. It must not be used to expose submission contents.

## Attachments

The definition schema includes attachment-reference fields so downstream applications do not need a breaking schema change later. The generic PR 4 browser renderer deliberately does not persist uploaded binary files.

Binary attachment handling is deferred to the document/evidence subsystem, where malware scanning, object storage, access control, hashing, and evidence metadata can be implemented once and reused safely. Headless clients may supply already-stored document reference IDs.

## Authoring UI

The initial administration UI edits validated JSON definitions. This intentionally tests the reusable schema and version lifecycle before introducing a visual form designer. A future drag-and-drop designer should emit the same definition format rather than create a second form model.
