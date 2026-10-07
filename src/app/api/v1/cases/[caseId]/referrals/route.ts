import { getRuntimeDatabase } from "@/db/runtime";
import { findCaseById } from "@/modules/cases/repository";
import {
  apiJson,
  authorizeApiRequest,
  isUuid,
} from "@/modules/api/http";
import { listCaseReferrals } from "@/modules/referrals/repository";
import { createCaseReferral } from "@/modules/referrals/service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const auth = await authorizeApiRequest(request, [
    "case:view",
    "referral:view",
  ]);
  if (!auth.ok) return auth.response;

  const { caseId } = await params;
  if (!isUuid(caseId)) {
    return apiJson(
      auth.context,
      { error: { code: "invalid_id", message: "caseId must be a UUID." } },
      { status: 400 },
    );
  }

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
    data: await listCaseReferrals(
      db,
      auth.context.tenantScope,
      caseId,
    ),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const auth = await authorizeApiRequest(request, [
    "case:view",
    "referral:manage",
  ]);
  if (!auth.ok) return auth.response;

  const { caseId } = await params;
  if (!isUuid(caseId)) {
    return apiJson(
      auth.context,
      { error: { code: "invalid_id", message: "caseId must be a UUID." } },
      { status: 400 },
    );
  }

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

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiJson(
      auth.context,
      { error: { code: "invalid_json", message: "Request body must be JSON." } },
      { status: 400 },
    );
  }

  try {
    const referral = await createCaseReferral(
      db,
      auth.context.tenantScope,
      {
        caseId,
        policyKey: String(body.policyKey ?? ""),
        recipientKey:
          body.recipientKey === undefined
            ? null
            : String(body.recipientKey),
        recipientName: String(body.recipientName ?? ""),
        externalReference:
          body.externalReference === undefined
            ? null
            : String(body.externalReference),
        subject:
          body.subject === undefined ? null : String(body.subject),
        summary:
          body.summary === undefined ? null : String(body.summary),
        actorUserId: auth.context.apiClient.createdByUserId,
      },
    );
    return apiJson(auth.context, { data: referral }, { status: 201 });
  } catch {
    return apiJson(
      auth.context,
      {
        error: {
          code: "invalid_referral",
          message: "Referral could not be created.",
        },
      },
      { status: 400 },
    );
  }
}
