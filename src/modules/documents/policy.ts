import {
  canStaffViewInformationClass,
  informationClasses,
  parseInformationClass,
  type InformationClass,
} from "@/modules/disclosures/policy";

export const documentVisibilities = informationClasses;
export type DocumentVisibility = InformationClass;

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
  try {
    parseInformationClass(value);
    return true;
  } catch {
    return false;
  }
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
  return canStaffViewInformationClass(
    visibility,
    permissions,
  );
}
