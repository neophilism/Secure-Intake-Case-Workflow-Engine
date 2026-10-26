import { engineBuildInfo } from "@/lib/build-info";
import { corePermissions } from "@/modules/auth/permissions";
import type { ApiAuthorizationContext } from "./auth";

// Inventory of the bearer API only. A delegable permission is not evidence
// that an HTTP operation exists. Keep this inventory bound to the route tests.
export const apiEndpoints = [
  { id: "capabilities", method: "GET", path: "/api/v1/capabilities", requiredScopes: [], pagination: "none" },
  { id: "cases.list", method: "GET", path: "/api/v1/cases", requiredScopes: ["case:view"], pagination: "offset" },
  { id: "cases.get", method: "GET", path: "/api/v1/cases/{caseId}", requiredScopes: ["case:view"], pagination: "none" },
  { id: "deadlines.list", method: "GET", path: "/api/v1/cases/{caseId}/deadlines", requiredScopes: ["case:view", "deadline:view"], pagination: "none" },
  { id: "deadlines.extend", method: "POST", path: "/api/v1/cases/{caseId}/deadlines", requiredScopes: ["case:view", "deadline:operate"], pagination: "none" },
  { id: "referrals.list", method: "GET", path: "/api/v1/cases/{caseId}/referrals", requiredScopes: ["case:view", "referral:view"], pagination: "none" },
  { id: "referrals.create", method: "POST", path: "/api/v1/cases/{caseId}/referrals", requiredScopes: ["case:view", "referral:manage"], pagination: "none" },
  { id: "referrals.get", method: "GET", path: "/api/v1/cases/{caseId}/referrals/{referralId}", requiredScopes: ["case:view", "referral:view"], pagination: "none" },
  { id: "referrals.operate", method: "POST", path: "/api/v1/cases/{caseId}/referrals/{referralId}", requiredScopes: ["case:view", "referral:manage"], pagination: "none" },
  { id: "reviews.list", method: "GET", path: "/api/v1/cases/{caseId}/reviews", requiredScopes: ["case:view", "review:view"], pagination: "none" },
  { id: "documents.list", method: "GET", path: "/api/v1/cases/{caseId}/documents", requiredScopes: ["case:view", "document:view"], pagination: "none" },
  { id: "documents.get", method: "GET", path: "/api/v1/documents/{versionId}", requiredScopes: ["document:view"], pagination: "none" },
  { id: "forms.list", method: "GET", path: "/api/v1/forms", requiredScopes: ["form:view"], pagination: "none" },
  { id: "submissions.list", method: "GET", path: "/api/v1/submissions", requiredScopes: ["submission:view"], pagination: "offset" },
  { id: "audit.list", method: "GET", path: "/api/v1/audit-events", requiredScopes: ["audit:view"], pagination: "offset" },
] as const;

export function apiCapabilities(context: ApiAuthorizationContext) {
  // Never serialize the authorization context: it contains identifiers and
  // names that are unnecessary for feature negotiation.
  const grantedScopes = corePermissions.filter(
    (scope) => scope !== "api:manage" && scope !== "webhook:manage" && context.permissions.has(scope),
  ).sort();
  return {
    schemaVersion: 1,
    apiVersion: "v1",
    engine: engineBuildInfo,
    authentication: { scheme: "bearer", tenantSource: "api_client", grantedScopes },
    endpoints: apiEndpoints.map((endpoint) => ({
      ...endpoint,
      requiredScopes: [...endpoint.requiredScopes],
      available: endpoint.requiredScopes.every((scope) => grantedScopes.includes(scope)),
    })),
    limits: {
      pagination: { mode: "offset", defaultLimit: 50, maxLimit: 100, maxOffset: 10000, cursor: false, stableSnapshot: false, nextOffsetMayExceedMax: true },
      requestIdempotency: false,
      requestIdHeader: false,
      caseSearch: {
        query: ["q", "status", "priority", "queue", "assignee", "tag", "focus", "sort", "limit", "offset"],
        focuses: ["all", "open", "unassigned", "overdue", "escalated", "open_review", "recently_closed"],
        sorts: ["updated_desc", "created_desc", "priority_desc"],
      },
      submissionQuery: ["status", "formId", "limit", "offset"],
      auditQuery: ["action", "resourceType", "resourceId", "limit", "offset"],
      deadlineOperations: ["extend"],
      referralOperations: ["send", "acknowledge", "response", "complete", "cancel"],
      referralResponseTypes: ["preliminary_response", "status_update", "final_response"],
      attachments: {
        metadataOnly: true,
        binaryDownload: false,
        binaryUpload: false,
        protectedBinary: false,
        restrictedMetadataScope: "document:view_private",
        trustedContent: { contentStatus: "available", malwareScanStatus: "clean", digest: "sha256" },
      },
    },
  } as const;
}
