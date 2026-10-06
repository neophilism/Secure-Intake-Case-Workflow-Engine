import { getRuntimeDatabase } from "@/db/runtime";
import { listAuditEvents } from "@/modules/audit/repository";
import {
  apiJson,
  authorizeApiRequest,
  paginated,
  parsePage,
} from "@/modules/api/http";

export async function GET(request: Request) {
  const auth = await authorizeApiRequest(request, ["audit:view"]);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const { limit, offset } = parsePage(request);
  const records = await listAuditEvents(
    getRuntimeDatabase(),
    auth.context.tenantScope,
    {
      action: url.searchParams.get("action"),
      resourceType: url.searchParams.get("resourceType"),
      resourceId: url.searchParams.get("resourceId"),
      limit,
      offset,
    },
  );

  return apiJson(
    auth.context,
    paginated(records, limit, offset),
  );
}
