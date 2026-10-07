import { getRuntimeDatabase } from "@/db/runtime";
import {
  apiJson,
  authorizeApiRequest,
  isUuid,
} from "@/modules/api/http";
import {
  findCaseReferral,
  listReferralDeadlines,
  listReferralEvents,
} from "@/modules/referrals/repository";
import {
  acknowledgeCaseReferral,
  cancelCaseReferral,
  completeCaseReferral,
  recordCaseReferralResponse,
  sendCaseReferral,
} from "@/modules/referrals/service";

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ caseId: string; referralId: string }>;
  },
) {
  const auth = await authorizeApiRequest(request, [
    "case:view",
    "referral:view",
  ]);
  if (!auth.ok) return auth.response;

  const { caseId, referralId } = await params;
  if (!isUuid(caseId) || !isUuid(referralId)) {
    return apiJson(
      auth.context,
      { error: { code: "invalid_id", message: "IDs must be UUIDs." } },
      { status: 400 },
    );
  }

  const db = getRuntimeDatabase();
  const row = await findCaseReferral(
    db,
    auth.context.tenantScope,
    referralId,
  );
  if (!row || row.referral.caseId !== caseId) {
    return apiJson(
      auth.context,
      { error: { code: "not_found", message: "Referral not found." } },
      { status: 404 },
    );
  }

  const [events, deadlines] = await Promise.all([
    listReferralEvents(
      db,
      auth.context.tenantScope,
      referralId,
    ),
    listReferralDeadlines(
      db,
      auth.context.tenantScope,
      referralId,
    ),
  ]);

  return apiJson(auth.context, {
    data: {
      ...row,
      events,
      deadlines,
    },
  });
}

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ caseId: string; referralId: string }>;
  },
) {
  const auth = await authorizeApiRequest(request, [
    "case:view",
    "referral:manage",
  ]);
  if (!auth.ok) return auth.response;

  const { caseId, referralId } = await params;
  if (!isUuid(caseId) || !isUuid(referralId)) {
    return apiJson(
      auth.context,
      { error: { code: "invalid_id", message: "IDs must be UUIDs." } },
      { status: 400 },
    );
  }

  const db = getRuntimeDatabase();
  const row = await findCaseReferral(
    db,
    auth.context.tenantScope,
    referralId,
  );
  if (!row || row.referral.caseId !== caseId) {
    return apiJson(
      auth.context,
      { error: { code: "not_found", message: "Referral not found." } },
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

  const operation = String(body.operation ?? "");
  const actorUserId = auth.context.apiClient.createdByUserId;

  try {
    const data =
      operation === "send"
        ? await sendCaseReferral(
            db,
            auth.context.tenantScope,
            {
              referralId,
              actorUserId,
              note:
                body.summary === undefined
                  ? null
                  : String(body.summary),
            },
          )
        : operation === "acknowledge"
          ? await acknowledgeCaseReferral(
              db,
              auth.context.tenantScope,
              {
                referralId,
                actorUserId,
                summary:
                  body.summary === undefined
                    ? null
                    : String(body.summary),
                externalReference:
                  body.externalReference === undefined
                    ? null
                    : String(body.externalReference),
              },
            )
          : operation === "response"
            ? await recordCaseReferralResponse(
                db,
                auth.context.tenantScope,
                {
                  referralId,
                  actorUserId,
                  responseType: String(body.responseType) as
                    | "preliminary_response"
                    | "status_update"
                    | "final_response",
                  summary: String(body.summary ?? ""),
                },
              )
            : operation === "complete"
              ? await completeCaseReferral(
                  db,
                  auth.context.tenantScope,
                  {
                    referralId,
                    actorUserId,
                    reason: String(body.reason ?? ""),
                  },
                )
              : operation === "cancel"
                ? await cancelCaseReferral(
                    db,
                    auth.context.tenantScope,
                    {
                      referralId,
                      actorUserId,
                      reason: String(body.reason ?? ""),
                    },
                  )
                : null;

    if (!data) {
      return apiJson(
        auth.context,
        {
          error: {
            code: "invalid_operation",
            message: "Unsupported referral operation.",
          },
        },
        { status: 400 },
      );
    }

    return apiJson(auth.context, { data });
  } catch {
    return apiJson(
      auth.context,
      {
        error: {
          code: "referral_operation_failed",
          message: "Referral operation could not be completed.",
        },
      },
      { status: 400 },
    );
  }
}
