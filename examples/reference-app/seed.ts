import { readFile } from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import { createDatabase } from "../../src/db/client";
import {
  caseQueues,
  caseTeams,
  communicationTemplates,
  organizationMemberships,
  reviewPolicies,
  roles,
  userCredentials,
  users,
} from "../../src/db/schema";
import { createTrustedTenantScope } from "../../src/lib/tenancy";
import { applyApplicationManifest } from "../../src/modules/application/service";
import { parseApplicationManifest } from "../../src/modules/application/manifest";
import { bootstrapOrganizationAdministrator } from "../../src/modules/auth/bootstrap";
import { assignRoleToMembership } from "../../src/modules/auth/default-roles";
import { hashPassword, validatePassword } from "../../src/modules/auth/password";
import { listMembershipAuthorization } from "../../src/modules/auth/repository";
import {
  createCaseFromSubmission,
  transitionCase,
  updateCaseMetadata,
} from "../../src/modules/cases/service";
import {
  createCaseNote,
  createOutboundCorrespondenceDraft,
  queueOutboundCorrespondence,
  recordInboundCorrespondence,
  recordOutboundCorrespondenceSent,
} from "../../src/modules/communications/service";
import { submitPublicForm } from "../../src/modules/forms/service";
import {
  applyRoutingRules,
  addTeamMember,
  manualAssignCase,
} from "../../src/modules/routing/service";
import {
  applyReviewDecisionToCase,
  assignReview,
  beginReview,
  decideReview,
  fileCaseReview,
} from "../../src/modules/reviews/service";

const ORGANIZATION = {
  name: "Public Integrity Demonstration Office",
  slug: "public-integrity-demo",
};

const staff = [
  {
    key: "intake",
    email: "intake@public-integrity-demo.invalid",
    displayName: "Iris Intake",
    title: "Intake Officer",
    role: "integrity_intake_officer",
  },
  {
    key: "investigator",
    email: "investigator@public-integrity-demo.invalid",
    displayName: "Indigo Investigator",
    title: "Investigator",
    role: "integrity_investigator",
  },
  {
    key: "supervisor",
    email: "supervisor@public-integrity-demo.invalid",
    displayName: "Sam Supervisor",
    title: "Investigation Supervisor",
    role: "integrity_supervisor",
  },
  {
    key: "appeals",
    email: "appeals@public-integrity-demo.invalid",
    displayName: "Avery Appeals",
    title: "Appeals Officer",
    role: "integrity_appeals_officer",
  },
] as const;

type StaffKey = (typeof staff)[number]["key"];

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "The synthetic reference-app seeder is disabled in production.",
    );
  }

  const databaseUrl = process.env.DATABASE_URL;
  const demoPassword = process.env.REFERENCE_APP_PASSWORD;
  if (!databaseUrl || !demoPassword) {
    throw new Error(
      "DATABASE_URL and REFERENCE_APP_PASSWORD are required.",
    );
  }
  validatePassword(demoPassword);

  const manifestUrl = new URL("./application-manifest.json", import.meta.url);
  const manifest = parseApplicationManifest(
    JSON.parse(await readFile(manifestUrl, "utf8")),
  );

  const { client, db } = createDatabase(databaseUrl);

  try {
    const administrator = await bootstrapOrganizationAdministrator(db, {
      email: "admin@public-integrity-demo.invalid",
      password: demoPassword,
      displayName: "Dana Demonstration",
      organizationName: ORGANIZATION.name,
      organizationSlug: ORGANIZATION.slug,
    });
    const scope = createTrustedTenantScope(administrator.organizationId);

    await applyApplicationManifest(
      db,
      scope,
      manifest,
      administrator.userId,
    );

    const staffAccounts = new Map<
      StaffKey,
      { userId: string; membershipId: string }
    >();

    for (const person of staff) {
      const account = await ensureSyntheticStaffMember(
        db,
        scope.organizationId,
        person,
        demoPassword,
      );
      await assignRoleToMembership(
        db,
        scope,
        account.membershipId,
        person.role,
      );
      staffAccounts.set(person.key, account);
    }

    const investigatorTeam = await requireRow(
      db
        .select()
        .from(caseTeams)
        .where(
          and(
            eq(caseTeams.organizationId, scope.organizationId),
            eq(caseTeams.slug, "investigations"),
          ),
        )
        .limit(1),
      "investigations team",
    );

    await addTeamMember(db, scope, {
      teamId: investigatorTeam.id,
      membershipId: staffAccounts.get("investigator")!.membershipId,
      actorUserId: administrator.userId,
    });

    const submission = await submitPublicForm(
      db,
      ORGANIZATION.slug,
      "integrity-complaint",
      {
        name: "Casey Citizen",
        email: "casey.citizen@example.invalid",
        category: "procurement",
        summary:
          "A fictional municipal purchasing official allegedly directed a demonstration contract toward a company owned by a close associate without documenting the conflict.",
        urgent: false,
        truthful: true,
      },
    );

    let matter = await createCaseFromSubmission(db, scope, {
      submissionId: submission.id,
      actorUserId: administrator.userId,
      title: "Synthetic procurement conflict complaint",
      priority: "normal",
    });

    const intakeQueue = await requireQueue(db, scope.organizationId, "intake");
    await manualAssignCase(db, scope, {
      caseId: matter.id,
      queueId: intakeQueue.id,
      membershipId: staffAccounts.get("intake")!.membershipId,
      actorUserId: administrator.userId,
      reason: "Reference scenario intake assignment.",
    });

    matter = await transitionFor(
      db,
      scope,
      matter.id,
      "begin_screening",
      staffAccounts.get("intake")!,
      "Initial completeness screening started.",
    );

    matter = await transitionFor(
      db,
      scope,
      matter.id,
      "accept_for_investigation",
      staffAccounts.get("intake")!,
      "The synthetic complaint states a reviewable public-integrity concern.",
    );

    const routed = await applyRoutingRules(db, scope, {
      caseId: matter.id,
      actorUserId: staffAccounts.get("intake")!.userId,
    });
    if (!routed.matched || !routed.case.assignedMembershipId) {
      throw new Error("Reference scenario did not route to an investigator.");
    }
    matter = routed.case;

    await createCaseNote(db, scope, {
      caseId: matter.id,
      visibility: "internal",
      body:
        "Synthetic investigation opened. Initial complaint reviewed; additional contracting records are needed.",
      actorUserId: staffAccounts.get("investigator")!.userId,
    });

    matter = await transitionFor(
      db,
      scope,
      matter.id,
      "request_information",
      staffAccounts.get("investigator")!,
      "Additional supporting procurement records requested.",
    );

    const informationTemplate = await requireTemplate(
      db,
      scope.organizationId,
      "information_request",
    );
    const informationRequest = await createOutboundCorrespondenceDraft(
      db,
      scope,
      {
        caseId: matter.id,
        channel: "portal",
        recipients: [
          {
            type: "to",
            address: "casey-citizen-demo",
            name: "Casey Citizen",
          },
        ],
        templateId: informationTemplate.id,
        actorUserId: staffAccounts.get("investigator")!.userId,
      },
    );
    await queueOutboundCorrespondence(db, scope, {
      messageId: informationRequest.id,
      actorUserId: staffAccounts.get("investigator")!.userId,
    });
    await recordOutboundCorrespondenceSent(db, scope, {
      messageId: informationRequest.id,
      actorUserId: staffAccounts.get("investigator")!.userId,
      provider: "reference-demo",
      externalMessageId: `reference-info-${informationRequest.id}`,
    });

    await recordInboundCorrespondence(db, scope, {
      caseId: matter.id,
      channel: "portal",
      visibility: "participant",
      subject: "Response to information request",
      body:
        "Synthetic response: attached records are represented by the case narrative for this demonstration scenario.",
      senderAddress: "casey-citizen-demo",
      recipients: [{ type: "to", address: "integrity-office-demo" }],
      externalMessageId: `reference-reply-${matter.id}`,
      provider: "reference-demo",
      actorUserId: staffAccounts.get("investigator")!.userId,
    });

    matter = await transitionFor(
      db,
      scope,
      matter.id,
      "information_received",
      staffAccounts.get("investigator")!,
      "Requested synthetic information received and reviewed.",
    );

    await createCaseNote(db, scope, {
      caseId: matter.id,
      visibility: "internal",
      body:
        "Synthetic investigation complete. Evidence supports a disclosure and recusal deficiency but not intentional procurement fraud.",
      actorUserId: staffAccounts.get("investigator")!.userId,
    });

    matter = await transitionFor(
      db,
      scope,
      matter.id,
      "submit_supervisor_review",
      staffAccounts.get("investigator")!,
      "Investigation submitted for supervisory decision.",
    );

    const supervisorQueue = await requireQueue(
      db,
      scope.organizationId,
      "supervisory_review",
    );
    await manualAssignCase(db, scope, {
      caseId: matter.id,
      queueId: supervisorQueue.id,
      membershipId: staffAccounts.get("supervisor")!.membershipId,
      actorUserId: administrator.userId,
      reason: "Reference scenario supervisory assignment.",
    });

    matter = await updateCaseMetadata(db, scope, {
      caseId: matter.id,
      title: matter.title,
      summary:
        "Synthetic demonstration matter concerning procurement conflict disclosures and recusal procedures.",
      priority: "normal",
      disposition:
        "Substantiated in part: disclosure and recusal controls were inadequate; intentional procurement fraud was not established.",
      tags: ["accepted", "synthetic", "procurement"],
      actorUserId: staffAccounts.get("supervisor")!.userId,
    });

    matter = await transitionFor(
      db,
      scope,
      matter.id,
      "issue_decision",
      staffAccounts.get("supervisor")!,
      "Initial written disposition approved for the synthetic matter.",
    );

    const decisionTemplate = await requireTemplate(
      db,
      scope.organizationId,
      "decision_notice",
    );
    const decisionNotice = await createOutboundCorrespondenceDraft(
      db,
      scope,
      {
        caseId: matter.id,
        channel: "portal",
        recipients: [
          {
            type: "to",
            address: "casey-citizen-demo",
            name: "Casey Citizen",
          },
        ],
        templateId: decisionTemplate.id,
        actorUserId: staffAccounts.get("supervisor")!.userId,
      },
    );
    await queueOutboundCorrespondence(db, scope, {
      messageId: decisionNotice.id,
      actorUserId: staffAccounts.get("supervisor")!.userId,
    });
    await recordOutboundCorrespondenceSent(db, scope, {
      messageId: decisionNotice.id,
      actorUserId: staffAccounts.get("supervisor")!.userId,
      provider: "reference-demo",
      externalMessageId: `reference-decision-${decisionNotice.id}`,
    });

    const appealPolicy = await requireRow(
      db
        .select()
        .from(reviewPolicies)
        .where(
          and(
            eq(reviewPolicies.organizationId, scope.organizationId),
            eq(reviewPolicies.key, "initial_appeal"),
          ),
        )
        .limit(1),
      "initial appeal policy",
    );

    const appeal = await fileCaseReview(db, scope, {
      caseId: matter.id,
      policyId: appealPolicy.id,
      grounds:
        "Synthetic appellant challenges the breadth of the initial disposition and requests clarification of the corrective action.",
      requestedRelief:
        "Modify the decision to specify the corrective disclosure and recusal requirements.",
      actorUserId: staffAccounts.get("intake")!.userId,
    });

    const assignedAppeal = await assignReview(db, scope, {
      reviewId: appeal.id,
      reviewerMembershipId: staffAccounts.get("appeals")!.membershipId,
      actorUserId: administrator.userId,
    });

    await beginReview(db, scope, {
      reviewId: assignedAppeal.id,
      actorMembershipId: staffAccounts.get("appeals")!.membershipId,
      actorUserId: staffAccounts.get("appeals")!.userId,
    });

    const decidedAppeal = await decideReview(db, scope, {
      reviewId: assignedAppeal.id,
      actorMembershipId: staffAccounts.get("appeals")!.membershipId,
      actorUserId: staffAccounts.get("appeals")!.userId,
      outcome: "modified",
      writtenDecision:
        "The synthetic appeal is granted in part. The initial finding remains, but the corrective action is modified to require a written conflict disclosure and documented recusal procedure.",
    });

    const appealEffect = await applyReviewDecisionToCase(db, scope, {
      reviewId: decidedAppeal.id,
      targetStatus: "appeal_decided",
      actorUserId: administrator.userId,
    });
    matter = appealEffect.case;

    matter = await transitionFor(
      db,
      scope,
      matter.id,
      "close_after_appeal",
      staffAccounts.get("supervisor")!,
      "Synthetic appeal decision applied; matter closed.",
    );

    process.stdout.write(
      JSON.stringify(
        {
          organization: ORGANIZATION,
          application: manifest.application.key,
          submission: {
            id: submission.id,
            confirmationCode: submission.confirmationCode,
          },
          case: {
            id: matter.id,
            caseNumber: matter.caseNumber,
            status: matter.status,
            disposition: matter.disposition,
          },
          appeal: {
            id: decidedAppeal.id,
            status: decidedAppeal.status,
            outcome: decidedAppeal.outcome,
            effectAppliedTo: "appeal_decided",
          },
          syntheticStaff: Object.fromEntries(
            [...staffAccounts.entries()].map(([key, value]) => [
              key,
              value.membershipId,
            ]),
          ),
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    await client.end();
  }
}

async function ensureSyntheticStaffMember(
  db: ReturnType<typeof createDatabase>["db"],
  organizationId: string,
  person: (typeof staff)[number],
  password: string,
) {
  let [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, person.email))
    .limit(1);

  if (!user) {
    [user] = await db
      .insert(users)
      .values({
        email: person.email,
        displayName: person.displayName,
        status: "active",
      })
      .returning();
  } else {
    [user] = await db
      .update(users)
      .set({
        displayName: person.displayName,
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning();
  }

  const passwordHash = await hashPassword(password);
  await db
    .insert(userCredentials)
    .values({ userId: user.id, passwordHash })
    .onConflictDoUpdate({
      target: userCredentials.userId,
      set: { passwordHash, passwordUpdatedAt: new Date() },
    });

  let [membership] = await db
    .select()
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, organizationId),
        eq(organizationMemberships.userId, user.id),
      ),
    )
    .limit(1);

  if (!membership) {
    [membership] = await db
      .insert(organizationMemberships)
      .values({
        organizationId,
        userId: user.id,
        status: "active",
        title: person.title,
      })
      .returning();
  } else {
    [membership] = await db
      .update(organizationMemberships)
      .set({
        status: "active",
        title: person.title,
        updatedAt: new Date(),
      })
      .where(eq(organizationMemberships.id, membership.id))
      .returning();
  }

  const [declaredRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(
      and(
        eq(roles.organizationId, organizationId),
        eq(roles.key, person.role),
      ),
    )
    .limit(1);
  if (!declaredRole) {
    throw new Error(`Manifest role was not reconciled: ${person.role}`);
  }

  return { userId: user.id, membershipId: membership.id };
}

async function transitionFor(
  db: ReturnType<typeof createDatabase>["db"],
  scope: ReturnType<typeof createTrustedTenantScope>,
  caseId: string,
  transitionKey: string,
  actor: { userId: string; membershipId: string },
  comment: string,
) {
  const permissions = await listMembershipAuthorization(
    db,
    scope,
    actor.membershipId,
  );

  return transitionCase(db, scope, {
    caseId,
    transitionKey,
    actorUserId: actor.userId,
    actorPermissions: permissions
      .map((entry) => entry.permission)
      .filter((permission): permission is string => Boolean(permission)),
    comment,
  });
}

async function requireQueue(
  db: ReturnType<typeof createDatabase>["db"],
  organizationId: string,
  slug: string,
) {
  return requireRow(
    db
      .select()
      .from(caseQueues)
      .where(
        and(
          eq(caseQueues.organizationId, organizationId),
          eq(caseQueues.slug, slug),
        ),
      )
      .limit(1),
    `queue ${slug}`,
  );
}

async function requireTemplate(
  db: ReturnType<typeof createDatabase>["db"],
  organizationId: string,
  key: string,
) {
  return requireRow(
    db
      .select()
      .from(communicationTemplates)
      .where(
        and(
          eq(communicationTemplates.organizationId, organizationId),
          eq(communicationTemplates.key, key),
        ),
      )
      .limit(1),
    `communication template ${key}`,
  );
}

async function requireRow<T>(
  promise: Promise<T[]>,
  label: string,
): Promise<T> {
  const [row] = await promise;
  if (!row) throw new Error(`Reference app is missing ${label}.`);
  return row;
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Unknown reference-app failure.";
  process.stderr.write(`Reference app seed failed: ${message}\n`);
  process.exitCode = 1;
});
