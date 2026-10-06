export const documentVisibilities = [
  "participant",
  "internal",
  "restricted",
] as const;

export type DocumentVisibility =
  (typeof documentVisibilities)[number];

export const malwareScanStatuses = [
  "pending",
  "clean",
  "infected",
  "failed",
] as const;

export type MalwareScanStatus =
  (typeof malwareScanStatuses)[number];

export const documentContentStatuses = [
  "quarantined",
  "available",
  "blocked",
  "deleted",
] as const;

export type DocumentContentStatus =
  (typeof documentContentStatuses)[number];

export function isDocumentVisibility(
  value: string,
): value is DocumentVisibility {
  return (documentVisibilities as readonly string[]).includes(value);
}

export function isTrustedDocumentContent(input: {
  contentStatus: string;
  malwareScanStatus: string;
  sha256: string;
}): boolean {
  return (
    input.contentStatus === "available" &&
    input.malwareScanStatus === "clean" &&
    /^[a-f0-9]{64}$/i.test(input.sha256)
  );
}

export function canViewDocumentVisibility(
  visibility: string,
  permissions: ReadonlySet<string>,
): boolean {
  if (visibility === "restricted") {
    return permissions.has("document:view_private");
  }

  return permissions.has("document:view");
}
