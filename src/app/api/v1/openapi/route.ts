import { NextResponse } from "next/server";

export function GET(request: Request) {
  const origin = new URL(request.url).origin;

  return NextResponse.json(
    {
      openapi: "3.1.0",
      info: {
        title: "Secure Intake & Case Workflow Engine API",
        version: "1.0.0",
        description:
          "Tenant-scoped API for cases, intake, documents, deadlines, referrals, reviews, and immutable audit events.",
      },
      servers: [{ url: origin }],
      components: {
        securitySchemes: {
          bearerApiKey: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "SICWE API key",
          },
        },
        parameters: {
          limit: {
            name: "limit",
            in: "query",
            schema: {
              type: "integer",
              minimum: 1,
              maximum: 100,
              default: 50,
            },
          },
          offset: {
            name: "offset",
            in: "query",
            schema: {
              type: "integer",
              minimum: 0,
              maximum: 10000,
              default: 0,
            },
          },
        },
      },
      security: [{ bearerApiKey: [] }],
      paths: {
        "/api/v1/cases": {
          get: {
            summary: "Search cases",
            description:
              "Requires case:view. Supports q, status, priority, queue, assignee, tag, focus, sort, limit, and offset. Service credentials cannot use focus=mine.",
            parameters: [
              { "$ref": "#/components/parameters/limit" },
              { "$ref": "#/components/parameters/offset" },
              { name: "q", in: "query", schema: { type: "string" } },
              { name: "status", in: "query", schema: { type: "string" } },
              { name: "priority", in: "query", schema: { type: "string" } },
              { name: "queue", in: "query", schema: { type: "string" } },
              { name: "assignee", in: "query", schema: { type: "string" } },
              { name: "tag", in: "query", schema: { type: "string" } },
              {
                name: "focus",
                in: "query",
                schema: {
                  type: "string",
                  enum: [
                    "all",
                    "open",
                    "unassigned",
                    "overdue",
                    "escalated",
                    "open_review",
                    "recently_closed",
                  ],
                },
              },
            ],
            responses: { "200": { description: "Case page" } },
          },
        },
        "/api/v1/cases/{caseId}": {
          get: {
            summary: "Get a case",
            parameters: [
              {
                name: "caseId",
                in: "path",
                required: true,
                schema: { type: "string", format: "uuid" },
              },
            ],
            responses: { "200": { description: "Case" } },
          },
        },
        "/api/v1/cases/{caseId}/deadlines": {
          get: {
            summary: "List case deadlines",
            description:
              "Requires case:view and deadline:view. Includes case-level and referral-linked deadlines.",
            parameters: [
              {
                name: "caseId",
                in: "path",
                required: true,
                schema: { type: "string", format: "uuid" },
              },
            ],
            responses: { "200": { description: "Deadline list" } },
          },
          post: {
            summary: "Record a deadline extension",
            description:
              "Requires case:view and deadline:operate. operation must be extend; the deadline must belong to the case. Extensions are reasoned and audited.",
            parameters: [
              {
                name: "caseId",
                in: "path",
                required: true,
                schema: { type: "string", format: "uuid" },
              },
            ],
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: [
                      "operation",
                      "deadlineId",
                      "reason",
                      "extensionValue",
                      "extensionUnit",
                    ],
                    properties: {
                      operation: {
                        type: "string",
                        const: "extend",
                      },
                      deadlineId: {
                        type: "string",
                        format: "uuid",
                      },
                      reason: { type: "string" },
                      extensionValue: {
                        type: "integer",
                        minimum: 1,
                      },
                      extensionUnit: {
                        type: "string",
                        enum: [
                          "hours",
                          "calendar_days",
                          "business_days",
                        ],
                      },
                    },
                  },
                },
              },
            },
            responses: {
              "200": { description: "Extended deadline" },
              "400": { description: "Invalid extension" },
              "404": { description: "Case or deadline not found" },
            },
          },
        },
        "/api/v1/cases/{caseId}/referrals": {
          get: {
            summary: "List case referrals",
            description: "Requires case:view and referral:view.",
            parameters: [
              {
                name: "caseId",
                in: "path",
                required: true,
                schema: { type: "string", format: "uuid" },
              },
            ],
            responses: { "200": { description: "Referral list" } },
          },
          post: {
            summary: "Create a case referral",
            description: "Requires case:view and referral:manage.",
            parameters: [
              {
                name: "caseId",
                in: "path",
                required: true,
                schema: { type: "string", format: "uuid" },
              },
            ],
            responses: {
              "201": { description: "Created referral" },
              "400": { description: "Invalid referral" },
            },
          },
        },
        "/api/v1/cases/{caseId}/referrals/{referralId}": {
          get: {
            summary: "Get a referral with events and deadlines",
            description: "Requires case:view and referral:view.",
            parameters: [
              {
                name: "caseId",
                in: "path",
                required: true,
                schema: { type: "string", format: "uuid" },
              },
              {
                name: "referralId",
                in: "path",
                required: true,
                schema: { type: "string", format: "uuid" },
              },
            ],
            responses: {
              "200": { description: "Referral detail" },
              "404": { description: "Referral not found" },
            },
          },
          post: {
            summary: "Record a referral lifecycle operation",
            description:
              "Requires case:view and referral:manage. Supported operations are send, acknowledge, response, complete, and cancel.",
            parameters: [
              {
                name: "caseId",
                in: "path",
                required: true,
                schema: { type: "string", format: "uuid" },
              },
              {
                name: "referralId",
                in: "path",
                required: true,
                schema: { type: "string", format: "uuid" },
              },
            ],
            responses: {
              "200": { description: "Updated referral" },
              "400": { description: "Invalid referral operation" },
              "404": { description: "Referral not found" },
            },
          },
        },
        "/api/v1/cases/{caseId}/reviews": {
          get: {
            summary: "List case reviews",
            description: "Requires case:view and review:view.",
            parameters: [
              {
                name: "caseId",
                in: "path",
                required: true,
                schema: { type: "string", format: "uuid" },
              },
            ],
            responses: { "200": { description: "Review list" } },
          },
        },
        "/api/v1/cases/{caseId}/documents": {
          get: {
            summary: "List visible case document versions",
            description:
              "Requires case:view and document:view. Restricted documents additionally require document:view_private.",
            parameters: [
              {
                name: "caseId",
                in: "path",
                required: true,
                schema: { type: "string", format: "uuid" },
              },
            ],
            responses: { "200": { description: "Document list" } },
          },
        },
        "/api/v1/documents/{versionId}": {
          get: {
            summary: "Get visible document-version metadata",
            parameters: [
              {
                name: "versionId",
                in: "path",
                required: true,
                schema: { type: "string", format: "uuid" },
              },
            ],
            responses: { "200": { description: "Document metadata" } },
          },
        },
        "/api/v1/forms": {
          get: {
            summary: "List intake forms",
            description: "Requires form:view.",
            responses: { "200": { description: "Form list" } },
          },
        },
        "/api/v1/submissions": {
          get: {
            summary: "List intake submissions",
            description:
              "Requires submission:view. Supports status, formId, limit, and offset.",
            parameters: [
              { "$ref": "#/components/parameters/limit" },
              { "$ref": "#/components/parameters/offset" },
              { name: "status", in: "query", schema: { type: "string" } },
              {
                name: "formId",
                in: "query",
                schema: { type: "string", format: "uuid" },
              },
            ],
            responses: { "200": { description: "Submission page" } },
          },
        },
        "/api/v1/audit-events": {
          get: {
            summary: "List immutable audit events",
            description:
              "Requires audit:view. Supports action, resourceType, resourceId, limit, and offset.",
            parameters: [
              { "$ref": "#/components/parameters/limit" },
              { "$ref": "#/components/parameters/offset" },
              { name: "action", in: "query", schema: { type: "string" } },
              {
                name: "resourceType",
                in: "query",
                schema: { type: "string" },
              },
              {
                name: "resourceId",
                in: "query",
                schema: { type: "string" },
              },
            ],
            responses: { "200": { description: "Audit event page" } },
          },
        },
        "/api/v1/openapi": {
          get: {
            security: [],
            summary: "OpenAPI document",
            responses: { "200": { description: "OpenAPI 3.1 document" } },
          },
        },
      },
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300",
      },
    },
  );
}
