import { LocalFilesystemStorageAdapter } from "./storage-local";

export interface StoredObject {
  key: string;
  data: Uint8Array;
}

export interface DocumentStorageAdapter {
  readonly driver: string;
  put(key: string, data: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  remove(key: string): Promise<void>;
}

export function documentStorageKey(input: {
  organizationId: string;
  documentId: string;
  versionId: string;
}): string {
  return [
    input.organizationId,
    input.documentId,
    input.versionId,
  ].join("/");
}

export function getDocumentStorageAdapter(): DocumentStorageAdapter {
  const driver = process.env.DOCUMENT_STORAGE_DRIVER ?? "local";

  if (driver === "local") {
    return new LocalFilesystemStorageAdapter(
      process.env.DOCUMENT_STORAGE_ROOT ??
        "/tmp/secure-intake-case-documents",
    );
  }

  throw new Error(
    `Unsupported DOCUMENT_STORAGE_DRIVER: ${driver}. Configure a supported storage adapter.`,
  );
}
