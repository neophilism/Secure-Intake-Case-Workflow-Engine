import { getRuntimeDatabase } from "@/db/runtime";
import { listApiSubmissions } from "@/modules/api/repository";
import {
  apiJson,
  authorizeApiRequest,
  isUuid,
  paginated,
  parsePage,
} from "@/modules/api/http";

export async function GET(request: Request) {
  const auth = await authorizeApiRequest(request, ["submission:view"]);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const { limit, offset } = parsePage(request);
  const formId = url.searchParams.get("formId");
  if (formId && !isUuid(formId)) {
    return apiJson(
      auth.context,
      { error: { code: "invalid_id", message: "formId must be a UUID." } },
      { status: 400 },
    );
  }
  const records = await listApiSubmissions(
    getRuntimeDatabase(),
    auth.context.tenantScope,
    {
      status: url.searchParams.get("status"),
      formId,
      limit,
      offset,
    },
  );

  return apiJson(
    auth.context,
    paginated(records, limit, offset),
  );
}
