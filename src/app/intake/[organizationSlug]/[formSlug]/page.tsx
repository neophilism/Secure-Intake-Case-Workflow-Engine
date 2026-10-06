import { notFound } from "next/navigation";
import { getRuntimeDatabase } from "@/db/runtime";
import { FormRenderer } from "@/components/forms/form-renderer";
import { fieldsInDefinition } from "@/modules/forms/definition";
import { findPublishedFormBySlugs } from "@/modules/forms/repository";
import { submitPublicFormAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function PublicIntakePage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string; formSlug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { organizationSlug, formSlug } = await params;
  const { error } = await searchParams;

  const published = await findPublishedFormBySlugs(
    getRuntimeDatabase(),
    organizationSlug,
    formSlug,
    { publicOnly: true },
  );

  if (!published) {
    notFound();
  }

  const action = submitPublicFormAction.bind(
    null,
    organizationSlug,
    formSlug,
  );
  const requiresAttachmentAdapter = fieldsInDefinition(
    published.definition,
  ).some((field) => field.type === "file" && field.required);

  return (
    <main>
      <h1>{published.form.name}</h1>
      {published.form.description ? (
        <p>{published.form.description}</p>
      ) : null}
      <p>
        Provided by {published.organization.name}. Form version{" "}
        {published.version.versionNumber}.
      </p>

      {error === "validation" ? (
        <p role="alert">
          Some answers did not meet the form requirements. Review the form and
          try again.
        </p>
      ) : null}

      {requiresAttachmentAdapter ? (
        <p role="alert">
          This form requires secure attachments. The generic intake renderer
          cannot accept it until the document/evidence storage adapter is
          configured.
        </p>
      ) : (
        <FormRenderer definition={published.definition} action={action} />
      )}
    </main>
  );
}
