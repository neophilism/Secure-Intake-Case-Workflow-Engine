import { getRuntimeDatabase } from "@/db/runtime";
import { listForms } from "@/modules/forms/repository";
import {
  apiJson,
  authorizeApiRequest,
} from "@/modules/api/http";

export async function GET(request: Request) {
  const auth = await authorizeApiRequest(request, ["form:view"]);
  if (!auth.ok) return auth.response;

  const records = await listForms(
    getRuntimeDatabase(),
    auth.context.tenantScope,
  );

  return apiJson(auth.context, { data: records });
}
