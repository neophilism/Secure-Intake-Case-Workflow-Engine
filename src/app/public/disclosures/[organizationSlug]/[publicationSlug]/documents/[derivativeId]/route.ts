import { getRuntimeDatabase } from "@/db/runtime";
import { downloadPublishedDerivative } from "@/modules/disclosures/public";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: {
    params: Promise<{
      organizationSlug: string;
      publicationSlug: string;
      derivativeId: string;
    }>;
  },
) {
  const {
    organizationSlug,
    publicationSlug,
    derivativeId,
  } = await context.params;

  const result = await downloadPublishedDerivative(
    getRuntimeDatabase(),
    {
      organizationSlug,
      publicationSlug,
      derivativeId,
    },
  );

  if (!result) {
    return new Response("Not found", { status: 404 });
  }

  const safeFilename = result.filename
    .replace(/["\r\n]/g, "_")
    .slice(0, 240);

  return new Response(Buffer.from(result.data), {
    status: 200,
    headers: {
      "Content-Type":
        result.mimeType || "application/octet-stream",
      "Content-Length": String(result.sizeBytes),
      "Content-Disposition":
        `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(
          result.filename,
        )}`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ETag: `"${result.sha256}"`,
    },
  });
}
