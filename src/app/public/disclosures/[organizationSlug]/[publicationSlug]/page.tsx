import Link from "next/link";
import { notFound } from "next/navigation";
import { getRuntimeDatabase } from "@/db/runtime";
import { getPublishedDisclosure } from "@/modules/disclosures/public";

export const dynamic = "force-dynamic";

export default async function PublicDisclosurePage({
  params,
}: {
  params: Promise<{
    organizationSlug: string;
    publicationSlug: string;
  }>;
}) {
  const { organizationSlug, publicationSlug } =
    await params;

  const disclosure = await getPublishedDisclosure(
    getRuntimeDatabase(),
    organizationSlug,
    publicationSlug,
  );

  if (!disclosure) notFound();

  return (
    <main>
      <p>{disclosure.organization.name}</p>
      <h1>{disclosure.title}</h1>
      {disclosure.summary ? (
        <p>{disclosure.summary}</p>
      ) : null}
      <p>
        Published{" "}
        {disclosure.publishedAt?.toISOString() ?? "—"}
      </p>

      {Object.keys(disclosure.data).length > 0 ? (
        <section>
          <h2>Public information</h2>
          <pre>
            {JSON.stringify(disclosure.data, null, 2)}
          </pre>
        </section>
      ) : null}

      {disclosure.documents.length > 0 ? (
        <section>
          <h2>Public documents</h2>
          <ul>
            {disclosure.documents.map((document) => (
              <li key={document.derivativeId}>
                <Link
                  href={`/public/disclosures/${encodeURIComponent(
                    organizationSlug,
                  )}/${encodeURIComponent(
                    publicationSlug,
                  )}/documents/${document.derivativeId}`}
                >
                  {document.label ??
                    document.filename}
                </Link>
                {" — "}
                {document.mimeType}, {document.sizeBytes} bytes
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
