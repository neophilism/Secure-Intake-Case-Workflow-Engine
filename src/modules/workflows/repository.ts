import { and, desc, eq, max } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  auditEvents,
  caseWorkflows,
  caseWorkflowVersions,
  intakeForms,
  intakeFormWorkflowBindings,
} from "@/db/schema";
import type { TenantScope } from "@/lib/tenancy";
import { auditEventValues } from "@/modules/audit/event";
import {
  parseWorkflowDefinition,
  type WorkflowDefinition,
} from "./definition";

export async function listWorkflows(
  db: Database,
  scope: TenantScope,
) {
  return db
    .select()
    .from(caseWorkflows)
    .where(eq(caseWorkflows.organizationId, scope.organizationId))
    .orderBy(caseWorkflows.name);
}

export async function findWorkflowById(
  db: Database,
  scope: TenantScope,
  workflowId: string,
) {
  const [workflow] = await db
    .select()
    .from(caseWorkflows)
    .where(
      and(
        eq(caseWorkflows.id, workflowId),
        eq(caseWorkflows.organizationId, scope.organizationId),
      ),
    )
    .limit(1);

  return workflow ?? null;
}

export async function createWorkflow(
  db: Database,
  scope: TenantScope,
  input: {
    slug: string;
    name: string;
    description?: string | null;
    createdByUserId?: string | null;
  },
) {
  const [workflow] = await db
    .insert(caseWorkflows)
    .values({
      organizationId: scope.organizationId,
      slug: input.slug,
      name: input.name,
      description: input.description ?? null,
      createdByUserId: input.createdByUserId ?? null,
    })
    .returning();


  await db.insert(auditEvents).values(
    auditEventValues({
      organizationId: scope.organizationId,
      actorType: input.createdByUserId ? "user" : "system",
      actorUserId: input.createdByUserId ?? null,
      action: "workflow.created",
      resourceType: "workflow",
      resourceId: workflow.id,
      newState: { status: workflow.status },
      metadata: { slug: workflow.slug },
    }),
  );

  return workflow;
}

export async function listWorkflowVersions(
  db: Database,
  scope: TenantScope,
  workflowId: string,
) {
  return db
    .select()
    .from(caseWorkflowVersions)
    .where(
      and(
        eq(caseWorkflowVersions.organizationId, scope.organizationId),
        eq(caseWorkflowVersions.workflowId, workflowId),
      ),
    )
    .orderBy(desc(caseWorkflowVersions.versionNumber));
}

export async function createDraftWorkflowVersion(
  db: Database,
  scope: TenantScope,
  input: {
    workflowId: string;
    definition: WorkflowDefinition;
    createdByUserId?: string | null;
  },
) {
  const workflow = await findWorkflowById(db, scope, input.workflowId);
  if (!workflow) {
    throw new Error("Workflow was not found in the active organization.");
  }

  const definition = parseWorkflowDefinition(input.definition);

  const [current] = await db
    .select({ value: max(caseWorkflowVersions.versionNumber) })
    .from(caseWorkflowVersions)
    .where(
      and(
        eq(caseWorkflowVersions.organizationId, scope.organizationId),
        eq(caseWorkflowVersions.workflowId, workflow.id),
      ),
    );

  const versionNumber = (current?.value ?? 0) + 1;

  const [version] = await db
    .insert(caseWorkflowVersions)
    .values({
      organizationId: scope.organizationId,
      workflowId: workflow.id,
      versionNumber,
      definition,
      status: "draft",
      createdByUserId: input.createdByUserId ?? null,
    })
    .returning();


  await db.insert(auditEvents).values(
    auditEventValues({
      organizationId: scope.organizationId,
      actorType: input.createdByUserId ? "user" : "system",
      actorUserId: input.createdByUserId ?? null,
      action: "workflow.version_created",
      resourceType: "workflow_version",
      resourceId: version.id,
      parentResourceType: "workflow",
      parentResourceId: workflow.id,
      newState: {
        versionNumber: version.versionNumber,
        status: version.status,
      },
    }),
  );

  return version;
}

export async function publishWorkflowVersion(
  db: Database,
  scope: TenantScope,
  versionId: string,
  actorUserId: string,
) {
  return db.transaction(async (tx) => {
    const [version] = await tx
      .select()
      .from(caseWorkflowVersions)
      .where(
        and(
          eq(caseWorkflowVersions.id, versionId),
          eq(
            caseWorkflowVersions.organizationId,
            scope.organizationId,
          ),
        ),
      )
      .limit(1);

    if (!version) {
      throw new Error(
        "Workflow version was not found in the active organization.",
      );
    }
    if (version.status !== "draft") {
      throw new Error("Only draft workflow versions may be published.");
    }

    const [workflow] = await tx
      .select()
      .from(caseWorkflows)
      .where(
        and(
          eq(caseWorkflows.id, version.workflowId),
          eq(caseWorkflows.organizationId, scope.organizationId),
        ),
      )
      .limit(1);

    if (!workflow || workflow.status !== "active") {
      throw new Error("The parent workflow is not active.");
    }

    parseWorkflowDefinition(version.definition);

    await tx
      .update(caseWorkflowVersions)
      .set({ status: "superseded", updatedAt: new Date() })
      .where(
        and(
          eq(
            caseWorkflowVersions.organizationId,
            scope.organizationId,
          ),
          eq(caseWorkflowVersions.workflowId, version.workflowId),
          eq(caseWorkflowVersions.status, "published"),
        ),
      );

    const [published] = await tx
      .update(caseWorkflowVersions)
      .set({
        status: "published",
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(caseWorkflowVersions.id, version.id))
      .returning();

    await tx.insert(auditEvents).values(
      auditEventValues({
        organizationId: scope.organizationId,
        actorType: "user",
        actorUserId,
        action: "workflow.version_published",
        resourceType: "workflow_version",
        resourceId: published.id,
        parentResourceType: "workflow",
        parentResourceId: version.workflowId,
        previousState: { status: version.status },
        newState: {
          status: published.status,
          versionNumber: published.versionNumber,
        },
      }),
    );

    return published;
  });
}

export async function findPublishedWorkflowVersion(
  db: Database,
  scope: TenantScope,
  workflowId: string,
) {
  const [version] = await db
    .select()
    .from(caseWorkflowVersions)
    .where(
      and(
        eq(caseWorkflowVersions.organizationId, scope.organizationId),
        eq(caseWorkflowVersions.workflowId, workflowId),
        eq(caseWorkflowVersions.status, "published"),
      ),
    )
    .limit(1);

  if (!version) return null;

  return {
    ...version,
    parsedDefinition: parseWorkflowDefinition(version.definition),
  };
}

export async function bindWorkflowToForm(
  db: Database,
  scope: TenantScope,
  input: {
    formId: string;
    workflowId: string;
    actorUserId: string;
  },
) {
  const [[form], workflow] = await Promise.all([
    db
      .select()
      .from(intakeForms)
      .where(
        and(
          eq(intakeForms.id, input.formId),
          eq(intakeForms.organizationId, scope.organizationId),
        ),
      )
      .limit(1),
    findWorkflowById(db, scope, input.workflowId),
  ]);

  if (!form || !workflow) {
    throw new Error(
      "Form and workflow must both exist in the active organization.",
    );
  }

  const published = await findPublishedWorkflowVersion(
    db,
    scope,
    workflow.id,
  );
  if (!published) {
    throw new Error("Only a workflow with a published version may be bound.");
  }

  const [binding] = await db
    .insert(intakeFormWorkflowBindings)
    .values({
      organizationId: scope.organizationId,
      formId: form.id,
      workflowId: workflow.id,
    })
    .onConflictDoUpdate({
      target: intakeFormWorkflowBindings.formId,
      set: {
        workflowId: workflow.id,
        organizationId: scope.organizationId,
        updatedAt: new Date(),
      },
    })
    .returning();


  await db.insert(auditEvents).values(
    auditEventValues({
      organizationId: scope.organizationId,
      actorType: "user",
      actorUserId: input.actorUserId,
      action: "workflow.bound_to_form",
      resourceType: "workflow",
      resourceId: workflow.id,
      parentResourceType: "intake_form",
      parentResourceId: form.id,
      metadata: {
        bindingId: binding.id,
        publishedWorkflowVersionId: published.id,
      },
    }),
  );

  return binding;
}

export async function findWorkflowBindingForForm(
  db: Database,
  scope: TenantScope,
  formId: string,
) {
  const [binding] = await db
    .select()
    .from(intakeFormWorkflowBindings)
    .where(
      and(
        eq(
          intakeFormWorkflowBindings.organizationId,
          scope.organizationId,
        ),
        eq(intakeFormWorkflowBindings.formId, formId),
      ),
    )
    .limit(1);

  return binding ?? null;
}

export async function listWorkflowBindings(
  db: Database,
  scope: TenantScope,
) {
  return db
    .select({
      formId: intakeFormWorkflowBindings.formId,
      workflowId: intakeFormWorkflowBindings.workflowId,
    })
    .from(intakeFormWorkflowBindings)
    .where(
      eq(
        intakeFormWorkflowBindings.organizationId,
        scope.organizationId,
      ),
    );
}
