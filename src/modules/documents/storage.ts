import { LocalFilesystemStorageAdapter } from "./storage-local";
import { S3CompatibleStorageAdapter } from "./storage-s3";

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
        ".data/documents",
    );
  }

  if (driver === "s3") {
    const endpoint = process.env.DOCUMENT_S3_ENDPOINT?.trim();
    const region =
      process.env.DOCUMENT_S3_REGION?.trim() || "us-east-1";
    const bucket = process.env.DOCUMENT_S3_BUCKET?.trim();
    const accessKeyId =
      process.env.DOCUMENT_S3_ACCESS_KEY_ID?.trim();
    const secretAccessKey =
      process.env.DOCUMENT_S3_SECRET_ACCESS_KEY?.trim();
    const sessionToken =
      process.env.DOCUMENT_S3_SESSION_TOKEN?.trim();

    if (
      !endpoint ||
      !bucket ||
      !accessKeyId ||
      !secretAccessKey
    ) {
      throw new Error(
        "S3 document storage requires DOCUMENT_S3_ENDPOINT, DOCUMENT_S3_BUCKET, DOCUMENT_S3_ACCESS_KEY_ID, and DOCUMENT_S3_SECRET_ACCESS_KEY.",
      );
    }

    return new S3CompatibleStorageAdapter({
      endpoint,
      region,
      bucket,
      accessKeyId,
      secretAccessKey,
      sessionToken: sessionToken || undefined,
    });
  }

  throw new Error(
    `Unsupported DOCUMENT_STORAGE_DRIVER: ${driver}. Configure a supported storage adapter.`,
  );
}
