import { describe, expect, it } from "vitest";
import type { WorkflowTransition } from "./definition";
import { evaluateTransitionGuards } from "./evaluator";

function transition(
  overrides: Partial<WorkflowTransition> = {},
): WorkflowTransition {
  return {
    key: "advance",
    label: "Advance",
    from: "one",
    to: "two",
    requiredPermissions: ["case:update"],
    comment: "optional",
    guards: {
      requiredCaseFields: [],
      requiredSubmissionFields: [],
      requiredDocuments: [],
    },
    actions: [],
    ...overrides,
  };
}

const baseContext = {
  actorPermissions: new Set(["case:update"]),
  comment: "",
  caseRecord: {
    title: "Case",
    summary: null,
    disposition: null,
    sourceSubmissionId: "submission_1",
  },
  submissionAnswers: { evidence_type: "records" },
  documentTypes: ["notice"],
};

describe("transition guard evaluation", () => {
  it("passes when all configured guards are satisfied", () => {
    const failures = evaluateTransitionGuards(
      transition({
        comment: "required",
        guards: {
          requiredCaseFields: ["title", "source_submission"],
          requiredSubmissionFields: ["evidence_type"],
          requiredDocuments: [{ type: "notice", minCount: 1 }],
        },
      }),
      { ...baseContext, comment: "Reviewed." },
    );

    expect(failures).toEqual([]);
  });

  it("reports permission, comment, field, and document failures", () => {
    const failures = evaluateTransitionGuards(
      transition({
        requiredPermissions: ["case:close"],
        comment: "required",
        guards: {
          requiredCaseFields: ["summary"],
          requiredSubmissionFields: ["missing_answer"],
          requiredDocuments: [{ type: "order", minCount: 2 }],
        },
      }),
      baseContext,
    );

    expect(failures.map((failure) => failure.code)).toEqual([
      "missing_permission",
      "comment_required",
      "missing_case_field",
      "missing_submission_field",
      "missing_document",
    ]);
  });

  it("requires configured referral count", () => {
    const failures = evaluateTransitionGuards(
      transition({
        guards: {
          referrals: { minCount: 2, requireAllFinal: false },
          requiredCaseFields: [],
          requiredSubmissionFields: [],
          requiredDocuments: [],
        },
      }),
      {
        ...baseContext,
        referrals: [{ status: "sent" }],
      },
    );

    expect(failures.map((failure) => failure.code)).toEqual([
      "missing_referral",
    ]);
  });

  it("can require all referrals to be final", () => {
    const failures = evaluateTransitionGuards(
      transition({
        guards: {
          referrals: { minCount: 1, requireAllFinal: true },
          requiredCaseFields: [],
          requiredSubmissionFields: [],
          requiredDocuments: [],
        },
      }),
      {
        ...baseContext,
        referrals: [
          { status: "completed" },
          { status: "sent" },
        ],
      },
    );

    expect(failures.map((failure) => failure.code)).toEqual([
      "open_referral",
    ]);

    expect(
      evaluateTransitionGuards(
        transition({
          guards: {
            referrals: {
              minCount: 1,
              requireAllFinal: true,
            },
            requiredCaseFields: [],
            requiredSubmissionFields: [],
            requiredDocuments: [],
          },
        }),
        {
          ...baseContext,
          referrals: [
            { status: "completed" },
            { status: "cancelled" },
          ],
        },
      ),
    ).toEqual([]);
  });

  it("enforces forbidden comments", () => {
    const failures = evaluateTransitionGuards(
      transition({ comment: "forbidden" }),
      { ...baseContext, comment: "not allowed" },
    );

    expect(failures).toContainEqual({
      code: "comment_forbidden",
      message: "This transition does not permit a comment.",
    });
  });
});
