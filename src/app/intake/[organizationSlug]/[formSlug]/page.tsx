import { notFound } from "next/navigation";
import { getRuntimeDatabase } from "@/db/runtime";
import { FormRenderer } from "@/components/forms/form-renderer";
import { fieldsInDefinition } from "@/modules/forms/definition";
import { findApplicationProfileByOrganizationSlug } from "@/modules/application/repository";
import { findPublishedFormBySlugs } from "@/modules/forms/repository";
import { submitPublicFormAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function PublicIntakePage({
  params,
}: {
  params: Promise<{ organizationSlug: string; formSlug: string }>;
}) {
  const { organizationSlug, formSlug } = await params;

  const db = getRuntimeDatabase();
  const [published, application] = await Promise.all([
    findPublishedFormBySlugs(
      db,
      organizationSlug,
      formSlug,
      { publicOnly: true },
    ),
    findApplicationProfileByOrganizationSlug(db, organizationSlug),
  ]);

  if (!published) {
    notFound();
  }

  const branding = application?.profile?.branding ?? {};
  const logoUrl =
    typeof branding.logoUrl === "string" &&
    (branding.logoUrl.startsWith("/") ||
      branding.logoUrl.startsWith("https://"))
      ? branding.logoUrl
      : null;
  const accentColor =
    typeof branding.accentColor === "string" &&
    /^#[0-9a-f]{6}$/i.test(branding.accentColor)
      ? branding.accentColor
      : null;
  const homeTitle =
    typeof branding.homeTitle === "string"
      ? branding.homeTitle
      : null;
  const homeDescription =
    typeof branding.homeDescription === "string"
      ? branding.homeDescription
      : null;
  const applicationName =
    application?.profile?.applicationName ??
    published.organization.name;

  const action = submitPublicFormAction.bind(
    null,
    organizationSlug,
    formSlug,
  );
  const requiresAttachmentAdapter = fieldsInDefinition(
    published.definition,
  ).some((field) => field.type === "file" && field.required);

  return (
    <main
      style={
        accentColor
          ? { borderTop: `4px solid ${accentColor}`, paddingTop: "1rem" }
          : undefined
      }
    >
      {logoUrl ? (
        <img
          src={logoUrl}
          alt=""
          style={{ maxHeight: "64px", maxWidth: "240px" }}
        />
      ) : null}
      <h1>{homeTitle ?? published.form.name}</h1>
      {homeDescription ? <p>{homeDescription}</p> : null}
      {homeTitle ? <h2>{published.form.name}</h2> : null}
      {published.form.description ? (
        <p>{published.form.description}</p>
      ) : null}
      <p>This form is provided by {applicationName}.</p>
      <details>
        <summary>Form information</summary>
        <p>Published form version {published.version.versionNumber}.</p>
      </details>

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
