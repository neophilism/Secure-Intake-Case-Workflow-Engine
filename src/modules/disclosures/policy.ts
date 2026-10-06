export const informationClasses = [
  "public",
  "participant",
  "internal",
  "restricted",
] as const;

export type InformationClass =
  (typeof informationClasses)[number];

export const disclosureSourceTypes = [
  "case",
  "submission",
  "document",
  "note",
  "correspondence",
  "review",
] as const;

export type DisclosureSourceType =
  (typeof disclosureSourceTypes)[number];

export const publicationVersionStatuses = [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "published",
  "superseded",
] as const;

export type PublicationVersionStatus =
  (typeof publicationVersionStatuses)[number];

export function parseInformationClass(
  value: string,
): InformationClass {
  const normalized =
    value === "case_participants" ? "participant" : value;

  if (
    !(informationClasses as readonly string[]).includes(
      normalized,
    )
  ) {
    throw new Error("Information classification is invalid.");
  }

  return normalized as InformationClass;
}

export function canExposeToAudience(
  classification: string,
  audience: "public" | "participant" | "internal",
): boolean {
  const normalized = parseInformationClass(classification);

  if (audience === "internal") {
    return normalized !== "restricted";
  }
  if (audience === "participant") {
    return (
      normalized === "public" ||
      normalized === "participant"
    );
  }
  return normalized === "public";
}

export function canStaffViewInformationClass(
  classification: string,
  permissions: ReadonlySet<string>,
): boolean {
  const normalized = parseInformationClass(classification);
  if (normalized === "restricted") {
    return permissions.has("document:view_private");
  }
  return permissions.has("document:view");
}
