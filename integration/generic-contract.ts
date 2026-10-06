import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { createDatabase } from "../src/db/client";
import {
  caseQueues,
  caseTeams,
  caseWorkflowVersions,
  caseWorkflows,
  cases,
  intakeForms,
  intakeFormVersions,
  intakeSubmissions,
  reviewPolicies,
} from "../src/db/schema";
import { createTrustedTenantScope } from "../src/lib/tenancy";
import {
  parseApplicationManifest,
  type ApplicationManifest,
} from "../src/modules/application/manifest";
import { applyApplicationManifest } from "../src/modules/application/service";
import { bootstrapOrganizationAdministrator } from "../src/modules/auth/bootstrap";
import { listMembershipAuthorization } from "../src/modules/auth/repository";
import {
  createCaseFromSubmission,
  transitionCase,
} from "../src/modules/cases/service";
import { listCaseDeadlines } from "../src/modules/deadlines/repository";
import { submitPublicForm } from "../src/modules/forms/service";
import {
  addTeamMember,
  applyRoutingRules,
} from "../src/modules/routing/service";
import {
  applyReviewDecisionToCase,
  assignReview,
  beginReview,
  decideReview,
  fileCaseReview,
} from "../src/modules/reviews/service";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for generic integration tests.");
}

const manifestUrl = new URL(
  "../examples/application-manifest.example.json",
  import.meta.url,
);

async function main() {
  const manifest = parseApplicationManifest(
    JSON.parse(await readFile(manifestUrl, "utf8")),
  );
  assert.equal(manifest.application.key, "example_application");

  const suffix = randomUUID().slice(0, 8);
  const organizationSlug = `contract-${suffix}`;
  const organizationName = `Contract ${suffix}`;
  const password = "NeutralContractPassword!123";
  const { client, db } = createDatabase(databaseUrl);

  try {
    const actor = await bootstrapOrganizationAdministrator(db, {
      email: `actor-${suffix}@example.invalid`,
      password,
      displayName: "Example Actor",
      organizationName,
      organizationSlug,
    });
    const reviewer = await bootstrapOrganizationAdministrator(db, {
      email: `reviewer-${suffix}@example.invalid`,
      password,
      displayName: "Example Reviewer",
      organizationName,
      organizationSlug,
    });
    const scope = createTrustedTenantScope(actor.organizationId);

    // First apply creates the portable resources.
    const firstApply = await applyApplicationManifest(
      db,
      scope,
      manifest,
      actor.userId,
    );
    assert.equal(firstApply.noChange, false);

    // Identical reapplication is a true idempotent no-op.
    const identicalApply = await applyApplicationManifest(
      db,
      scope,
      manifest,
      actor.userId,
    );
    assert.equal(identicalApply.noChange, true);
    assert.equal(identicalApply.revisionId, firstApply.revisionId);

    const [team] = await db
      .select()
      .from(caseTeams)
      .where(
        and(
          eq(caseTeams.organizationId, scope.organizationId),
          eq(caseTeams.slug, "example_team"),
        ),
      )
      .limit(1);
    assert.ok(team);

    await addTeamMember(db, scope, {
      teamId: team.id,
      membershipId: actor.membershipId,
      actorUserId: actor.userId,
    });

    const [form] = await db
      .select()
      .from(intakeForms)
      .where(
        and(
          eq(intakeForms.organizationId, scope.organizationId),
          eq(intakeForms.slug, "example_form"),
        ),
      )
      .limit(1);
    assert.ok(form);

    const [formVersionV1] = await db
      .select()
      .from(intakeFormVersions)
      .where(
        and(
          eq(intakeFormVersions.organizationId, scope.organizationId),
          eq(intakeFormVersions.formId, form.id),
          eq(intakeFormVersions.status, "published"),
        ),
      )
      .limit(1);
    assert.ok(formVersionV1);
    assert.equal(formVersionV1.versionNumber, 1);

    const [workflow] = await db
      .select()
      .from(caseWorkflows)
      .where(
        and(
          eq(caseWorkflows.organizationId, scope.organizationId),
          eq(caseWorkflows.slug, "example_workflow"),
        ),
      )
      .limit(1);
    assert.ok(workflow);

    const [workflowVersionV1] = await db
      .select()
      .from(caseWorkflowVersions)
      .where(
        and(
          eq(caseWorkflowVersions.organizationId, scope.organizationId),
          eq(caseWorkflowVersions.workflowId, workflow.id),
          eq(caseWorkflowVersions.status, "published"),
        ),
      )
      .limit(1);
    assert.ok(workflowVersionV1);
    assert.equal(workflowVersionV1.versionNumber, 1);

    const submission = await submitPublicForm(
      db,
      organizationSlug,
      "example_form",
      { example_value: "example value" },
    );
    assert.equal(submission.formVersionId, formVersionV1.id);

    let record = await createCaseFromSubmission(db, scope, {
      submissionId: submission.id,
      actorUserId: actor.userId,
      title: "Example Record",
    });
    assert.equal(record.status, "state_a");
    assert.equal(record.workflowVersionId, workflowVersionV1.id);

    const routed = await applyRoutingRules(db, scope, {
      caseId: record.id,
      actorUserId: actor.userId,
    });
    assert.equal(routed.matched, true);
    assert.equal(routed.case.assignedMembershipId, actor.membershipId);
    record = routed.case;

    const actorPermissions = (
      await listMembershipAuthorization(db, scope, actor.membershipId)
    )
      .map((entry) => entry.permission)
      .filter((permission): permission is string => Boolean(permission));

    record = await transitionCase(db, scope, {
      caseId: record.id,
      transitionKey: "advance_a_to_b",
      actorUserId: actor.userId,
      actorPermissions,
      comment: "neutral transition",
    });
    assert.equal(record.status, "state_b");

    let deadlines = await listCaseDeadlines(db, scope, record.id);
    assert.equal(deadlines.length, 1);
    assert.equal(deadlines[0].policyKey, "example_deadline");
    assert.equal(deadlines[0].status, "active");

    record = await transitionCase(db, scope, {
      caseId: record.id,
      transitionKey: "advance_b_to_c",
      actorUserId: actor.userId,
      actorPermissions,
      comment: "neutral decision transition",
    });
    assert.equal(record.status, "state_c");

    deadlines = await listCaseDeadlines(db, scope, record.id);
    assert.equal(deadlines.length, 1);
    assert.equal(deadlines[0].status, "completed");

    const [reviewPolicy] = await db
      .select()
      .from(reviewPolicies)
      .where(
        and(
          eq(reviewPolicies.organizationId, scope.organizationId),
          eq(reviewPolicies.key, "example_review"),
        ),
      )
      .limit(1);
    assert.ok(reviewPolicy);

    const review = await fileCaseReview(db, scope, {
      caseId: record.id,
      policyId: reviewPolicy.id,
      grounds: "neutral review grounds",
      requestedRelief: "neutral requested result",
      actorUserId: actor.userId,
    });

    const assignedReview = await assignReview(db, scope, {
      reviewId: review.id,
      reviewerMembershipId: reviewer.membershipId,
      actorUserId: actor.userId,
    });
    assert.equal(
      assignedReview.reviewerMembershipId,
      reviewer.membershipId,
    );

    await beginReview(db, scope, {
      reviewId: review.id,
      actorMembershipId: reviewer.membershipId,
      actorUserId: reviewer.userId,
    });

    const decidedReview = await decideReview(db, scope, {
      reviewId: review.id,
      actorMembershipId: reviewer.membershipId,
      actorUserId: reviewer.userId,
      outcome: "outcome_a",
      writtenDecision: "Neutral review decision.",
    });
    assert.equal(decidedReview.status, "decided");
    assert.equal(decidedReview.outcome, "outcome_a");

    const effect = await applyReviewDecisionToCase(db, scope, {
      reviewId: review.id,
      targetStatus: "state_d",
      actorUserId: reviewer.userId,
    });
    record = effect.case;
    assert.equal(record.status, "state_d");

    record = await transitionCase(db, scope, {
      caseId: record.id,
      transitionKey: "close_d",
      actorUserId: actor.userId,
      actorPermissions,
      comment: "neutral closure transition",
    });
    assert.equal(record.status, "state_closed");
    assert.ok(record.closedAt);

    // Updating the portable definition creates new published versions while
    // the historical submission/case remain pinned to v1.
    const changedManifestInput = structuredClone(
      manifest,
    ) as ApplicationManifest;
    changedManifestInput.forms[0].definition.intro =
      "Provide an updated example value.";
    changedManifestInput.workflows[0].definition.states =
      changedManifestInput.workflows[0].definition.states.map((state) =>
        state.key === "state_b"
          ? { ...state, label: "State B Updated" }
          : state,
      );
    const changedManifest = parseApplicationManifest(changedManifestInput);

    const changedApply = await applyApplicationManifest(
      db,
      scope,
      changedManifest,
      actor.userId,
    );
    assert.equal(changedApply.noChange, false);

    const formVersions = await db
      .select()
      .from(intakeFormVersions)
      .where(eq(intakeFormVersions.formId, form.id))
      .orderBy(asc(intakeFormVersions.versionNumber));
    assert.equal(formVersions.length, 2);
    assert.equal(formVersions[0].id, formVersionV1.id);
    assert.equal(formVersions[0].status, "superseded");
    assert.equal(formVersions[1].versionNumber, 2);
    assert.equal(formVersions[1].status, "published");

    const workflowVersions = await db
      .select()
      .from(caseWorkflowVersions)
      .where(eq(caseWorkflowVersions.workflowId, workflow.id))
      .orderBy(asc(caseWorkflowVersions.versionNumber));
    assert.equal(workflowVersions.length, 2);
    assert.equal(workflowVersions[0].id, workflowVersionV1.id);
    assert.equal(workflowVersions[0].status, "superseded");
    assert.equal(workflowVersions[1].versionNumber, 2);
    assert.equal(workflowVersions[1].status, "published");

    const [persistedSubmission] = await db
      .select()
      .from(intakeSubmissions)
      .where(eq(intakeSubmissions.id, submission.id))
      .limit(1);
    assert.ok(persistedSubmission);
    assert.equal(persistedSubmission.formVersionId, formVersionV1.id);

    const [persistedCase] = await db
      .select()
      .from(cases)
      .where(eq(cases.id, record.id))
      .limit(1);
    assert.ok(persistedCase);
    assert.equal(persistedCase.workflowVersionId, workflowVersionV1.id);
    assert.equal(persistedCase.status, "state_closed");

    // The manifest must not silently claim a matching locally-created
    // resource in another organization.
    const collisionSlug = `collision-${suffix}`;
    const collisionAdmin = await bootstrapOrganizationAdministrator(db, {
      email: `collision-${suffix}@example.invalid`,
      password,
      displayName: "Collision Actor",
      organizationName: `Collision ${suffix}`,
      organizationSlug: collisionSlug,
    });
    const collisionScope = createTrustedTenantScope(
      collisionAdmin.organizationId,
    );
    await db.insert(caseQueues).values({
      organizationId: collisionScope.organizationId,
      slug: "example_queue",
      name: "Locally Created Queue",
      assignmentStrategy: "manual",
      status: "active",
      createdByUserId: collisionAdmin.userId,
    });

    await assert.rejects(
      () =>
        applyApplicationManifest(
          db,
          collisionScope,
          manifest,
          collisionAdmin.userId,
        ),
      /cannot take ownership of existing routing_queue 'example_queue'/i,
    );

    process.stdout.write(
      "Generic integration contract passed.\n",
    );
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`Generic integration contract failed:\n${message}\n`);
  process.exitCode = 1;
});
