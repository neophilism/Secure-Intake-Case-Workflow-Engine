# ADR 0003: API, identifiers, timestamps, and errors

## Status
Accepted for PR 1.

## Decision
- External identifiers are opaque strings; database UUIDs are acceptable internal defaults.
- API timestamps use ISO 8601 UTC.
- API resources expose stable IDs and organization scope where applicable.
- Errors use a stable envelope with machine-readable code, human-readable message, and optional correlation ID/details.
- Request correlation IDs should flow into audit events and background work.
- REST/OpenAPI is the initial public API style; event/webhook interfaces arrive later.

## Example error envelope

```json
{
  "error": {
    "code": "permission_denied",
    "message": "You do not have permission to perform this action.",
    "correlationId": "req_..."
  }
}
```
