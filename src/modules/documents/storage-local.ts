import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DocumentStorageAdapter } from "./storage";

export class LocalFilesystemStorageAdapter
  implements DocumentStorageAdapter
{
  readonly driver = "local";

  constructor(private readonly root: string) {}

  async put(key: string, data: Uint8Array): Promise<void> {
    const filePath = this.resolveKey(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, data, { flag: "wx" });
  }

  async get(key: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(this.resolveKey(key)));
  }

  async remove(key: string): Promise<void> {
    await rm(this.resolveKey(key), { force: true });
  }

  private resolveKey(key: string): string {
    if (
      !/^[a-zA-Z0-9/_-]+$/.test(key) ||
      key.includes("..") ||
      path.isAbsolute(key)
    ) {
      throw new Error("Invalid document storage key.");
    }

    const root = path.resolve(this.root);
    const resolved = path.resolve(root, key);

    if (
      resolved !== root &&
      !resolved.startsWith(root + path.sep)
    ) {
      throw new Error("Document storage key escaped configured root.");
    }

    return resolved;
  }
}
