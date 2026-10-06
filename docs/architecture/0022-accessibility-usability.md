# ADR 0022: Accessibility and public-sector usability baseline

## Status

Accepted for PR 19.

## Decision

Accessibility is a core engine contract, not a bill-specific theme feature.

The shared engine provides semantic structure and interaction behavior that
downstream thin applications should inherit unless they replace it with an
equally accessible implementation.

## Baseline

The reusable UI baseline includes:

- one keyboard-accessible skip link to the main content target;
- visible `:focus-visible` treatment;
- semantic headings, landmarks, labels, fieldsets, legends, and table captions;
- minimum practical control sizing;
- responsive table overflow rather than viewport clipping;
- readable line lengths;
- reduced-motion support;
- print rules for case-summary use;
- status/error regions announced to assistive technology.

## Intake validation

Public intake validation stays on the same page.

A failed server-side validation returns only validation metadata to the client;
answers are not placed in a query string.

The renderer:

1. preserves the user's entered answers;
2. focuses the error summary;
3. links each error to the related control/group;
4. marks the invalid control/group with `aria-invalid`;
5. associates field help and error text with `aria-describedby`.

Successful submission continues to redirect to the confirmation flow.

## Required fields

Required controls retain the native `required` attribute when the control type
supports it.

A visible asterisk is accompanied by screen-reader text so required status is
not communicated by shape alone.

## Branding

The application-manifest accent color remains decorative on public intake; it is
not used as the sole text/background contrast mechanism.

Thin applications may extend the visual theme, but the engine does not permit
branding configuration to replace semantic labels or validation behavior.

## Responsive behavior

The core remains usable at narrow viewport widths without requiring a separate
mobile application.

Large operational tables may scroll horizontally instead of compressing cells
until text becomes unreadable.

Definition lists collapse from two columns to one on small screens.

## Print output

The case-detail screen can invoke the browser print workflow.

Interactive/navigation controls are removed from print presentation and major
record sections attempt to avoid page-break fragmentation.

Print output is an operator convenience view and does not replace immutable
document exports, disclosure derivatives, or audit evidence.

## Automated tests

The repository includes an Axe-based WCAG regression suite run explicitly in CI
before the ordinary unit suite.

The automated suite is intentionally representative rather than a claim of
complete conformance. Browser layout-dependent color-contrast checks are not
treated as reliable under JSDOM.

## Conformance posture

The engineering target is WCAG 2.1 AA-compatible behavior for reusable core
surfaces.

No repository-level automated test can certify an entire deployment because
thin-app copy, branding, added components, linked documents, deployment
configuration, and operational content can introduce accessibility defects.

Each production thin application therefore remains responsible for end-to-end
manual accessibility review.
