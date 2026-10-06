import { getRuntimeDatabase } from "@/db/runtime";
import { listApiSubmissions } from "@/modules/api/repository";
import {
  apiJson,
  authorizeApiRequest,
  paginated,
  parsePage,
} from "@/modules/api/http";

export async function GET(request: Request) {
  const auth = await authorizeApiRequest(request, ["submission:view"]);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const { limit, offset } = parsePage(request);
  const records = await listApiSubmissions(
    getRuntimeDatabase(),
    auth.context.tenantScope,
    {
      status: url.searchParams.get("status"),
      formId: url.searchParams.get("formId"),
      limit,
      offset,
    },
  );

  return apiJson(
    auth.context,
    paginated(records, limit, offset),
  );
}
