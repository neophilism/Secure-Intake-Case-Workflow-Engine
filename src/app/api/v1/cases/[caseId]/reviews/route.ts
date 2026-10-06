import { getRuntimeDatabase } from "@/db/runtime";
import { findCaseById } from "@/modules/cases/repository";
import { listCaseReviews } from "@/modules/reviews/repository";
import {
  apiJson,
  authorizeApiRequest,
} from "@/modules/api/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const auth = await authorizeApiRequest(request, [
    "case:view",
    "review:view",
  ]);
  if (!auth.ok) return auth.response;

  const { caseId } = await params;
  const db = getRuntimeDatabase();
  const record = await findCaseById(
    db,
    auth.context.tenantScope,
    caseId,
  );
  if (!record) {
    return apiJson(
      auth.context,
      { error: { code: "not_found", message: "Case not found." } },
      { status: 404 },
    );
  }

  return apiJson(auth.context, {
    data: await listCaseReviews(
      db,
      auth.context.tenantScope,
      caseId,
    ),
  });
}
