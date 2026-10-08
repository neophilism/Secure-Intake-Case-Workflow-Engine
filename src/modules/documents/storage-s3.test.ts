import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { S3CompatibleStorageAdapter } from "./storage-s3";

afterEach(() => {
  vi.unstubAllGlobals();
});

function adapter() {
  return new S3CompatibleStorageAdapter({
    endpoint: "https://objects.example.test",
    region: "us-east-1",
    bucket: "case-files",
    accessKeyId: "AKIATEST",
    secretAccessKey: "test-secret",
  });
}

describe("S3-compatible document storage", () => {
  it("signs and writes immutable object bytes", async () => {
    const fetchMock = vi.fn(async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      expect(String(input)).toBe(
        "https://objects.example.test/case-files/org/doc/version",
      );
      expect(init?.method).toBe("PUT");
      const headers = init?.headers as Record<string, string>;
      expect(headers.authorization).toMatch(
        /^AWS4-HMAC-SHA256 Credential=AKIATEST\//,
      );
      expect(headers["x-amz-content-sha256"]).toMatch(
        /^[a-f0-9]{64}$/,
      );
      expect(headers["x-amz-date"]).toMatch(/^\d{8}T\d{6}Z$/);
      expect(Buffer.from(init?.body as Buffer).toString("utf8")).toBe(
        "evidence",
      );
      return new Response(null, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await adapter().put(
      "org/doc/version",
      new TextEncoder().encode("evidence"),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retrieves and deletes objects", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(new TextEncoder().encode("evidence"), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const storage = adapter();
    expect(
      new TextDecoder().decode(
        await storage.get("org/doc/version"),
      ),
    ).toBe("evidence");
    await storage.remove("org/doc/version");

    expect(fetchMock.mock.calls[0][1]?.method).toBe("GET");
    expect(fetchMock.mock.calls[1][1]?.method).toBe("DELETE");
  });

  it("rejects traversal keys and non-HTTPS endpoints", async () => {
    await expect(
      adapter().put(
        "../escape",
        new Uint8Array([1]),
      ),
    ).rejects.toThrow(/Invalid document storage key/);

    expect(
      () =>
        new S3CompatibleStorageAdapter({
          endpoint: "http://objects.example.test",
          region: "us-east-1",
          bucket: "case-files",
          accessKeyId: "AKIATEST",
          secretAccessKey: "test-secret",
        }),
    ).toThrow(/bare HTTPS URL/);
  });
});
