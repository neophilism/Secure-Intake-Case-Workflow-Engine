import { apiCapabilities } from "@/modules/api/capabilities";
import { apiJson, authorizeApiRequest } from "@/modules/api/http";

export async function GET(request: Request) {
  // Any valid API client can discover its own scopes, even if it has no
  // permission for a particular resource. Authentication/rate limits still run.
  const auth = await authorizeApiRequest(request, []);
  if (!auth.ok) return auth.response;
  return apiJson(auth.context, { data: apiCapabilities(auth.context) });
}
