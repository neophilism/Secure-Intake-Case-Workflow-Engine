"use server";

import { redirect } from "next/navigation";
import { getRuntimeDatabase } from "@/db/runtime";
import {
  hasPermission,
  requireTenantScope,
} from "@/modules/auth/authorization";
import { getCurrentAuthorizationContext } from "@/modules/auth/server-session";
import { parseWorkflowDefinition } from "@/modules/workflows/definition";
import {
  bindWorkflowToForm,
  createDraftWorkflowVersion,
  createWorkflow,
  publishWorkflowVersion,
} from "@/modules/workflows/repository";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

async function requireWorkflowManager() {
  const context = await getCurrentAuthorizationContext();
  if (!context) redirect("/login");
  if (!context.tenantScope) redirect("/select-organization");
  if (!hasPermission(context, "workflow:manage")) {
    redirect("/forbidden");
  }
  return context;
}

function parseDefinitionJson(raw: string) {
  try {
    return parseWorkflowDefinition(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function createWorkflowAction(formData: FormData) {
  const context = await requireWorkflowManager();
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  const description = String(
    formData.get("description") ?? "",
  ).trim();
  const definition = parseDefinitionJson(
    String(formData.get("definition") ?? ""),
  );

  if (!name || !slugPattern.test(slug) || !definition) {
    redirect("/admin/workflows?error=invalid_workflow");
  }

  const scope = requireTenantScope(context);

  try {
    const workflow = await createWorkflow(
      getRuntimeDatabase(),
      scope,
      {
        name,
        slug,
        description: description || null,
        createdByUserId: context.user.id,
      },
    );

    await createDraftWorkflowVersion(
      getRuntimeDatabase(),
      scope,
      {
        workflowId: workflow.id,
        definition,
        createdByUserId: context.user.id,
      },
    );
  } catch {
    redirect("/admin/workflows?error=create_failed");
  }

  redirect("/admin/workflows");
}

export async function createWorkflowVersionAction(
  formData: FormData,
) {
  const context = await requireWorkflowManager();
  const workflowId = String(
    formData.get("workflowId") ?? "",
  ).trim();
  const definition = parseDefinitionJson(
    String(formData.get("definition") ?? ""),
  );

  if (!workflowId || !definition) {
    redirect("/admin/workflows?error=invalid_definition");
  }

  try {
    await createDraftWorkflowVersion(
      getRuntimeDatabase(),
      requireTenantScope(context),
      {
        workflowId,
        definition,
        createdByUserId: context.user.id,
      },
    );
  } catch {
    redirect("/admin/workflows?error=create_version_failed");
  }

  redirect("/admin/workflows");
}

export async function publishWorkflowVersionAction(
  formData: FormData,
) {
  const context = await requireWorkflowManager();
  const versionId = String(
    formData.get("versionId") ?? "",
  ).trim();

  if (!versionId) {
    redirect("/admin/workflows?error=invalid_version");
  }

  try {
    await publishWorkflowVersion(
      getRuntimeDatabase(),
      requireTenantScope(context),
      versionId,
    );
  } catch {
    redirect("/admin/workflows?error=publish_failed");
  }

  redirect("/admin/workflows");
}

export async function bindWorkflowToFormAction(
  formData: FormData,
) {
  const context = await requireWorkflowManager();
  const formId = String(formData.get("formId") ?? "").trim();
  const workflowId = String(
    formData.get("workflowId") ?? "",
  ).trim();

  if (!formId || !workflowId) {
    redirect("/admin/workflows?error=invalid_binding");
  }

  try {
    await bindWorkflowToForm(
      getRuntimeDatabase(),
      requireTenantScope(context),
      { formId, workflowId },
    );
  } catch {
    redirect("/admin/workflows?error=binding_failed");
  }

  redirect("/admin/workflows");
}
