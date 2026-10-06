import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalFilesystemStorageAdapter } from "./storage-local";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true }),
    ),
  );
});

describe("local document storage", () => {
  it("round trips immutable bytes", async () => {
    const root = await mkdtemp(
      path.join(tmpdir(), "case-documents-"),
    );
    roots.push(root);
    const adapter = new LocalFilesystemStorageAdapter(root);
    const data = new TextEncoder().encode("evidence");

    await adapter.put("org/doc/version", data);
    expect(
      new TextDecoder().decode(
        await adapter.get("org/doc/version"),
      ),
    ).toBe("evidence");
  });

  it("rejects traversal keys", async () => {
    const root = await mkdtemp(
      path.join(tmpdir(), "case-documents-"),
    );
    roots.push(root);
    const adapter = new LocalFilesystemStorageAdapter(root);

    await expect(
      adapter.put("../escape", new Uint8Array([1])),
    ).rejects.toThrow(/Invalid document storage key/);
  });
});
