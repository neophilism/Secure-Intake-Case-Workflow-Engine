import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getRuntimeDatabase } from "@/db/runtime";
import { findApplicationProfileByOrganizationSlug } from "@/modules/application/repository";
import {
  readExternalParticipantSessionToken,
} from "@/modules/participant-portal/server-session";
import {
  resolveExternalParticipantContext,
} from "@/modules/participant-portal/service";
import { externalParticipantLoginAction } from "./actions";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function ExternalParticipantLoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { organizationSlug } = await params;
  const { error } = await searchParams;
  const db = getRuntimeDatabase();

  const token = await readExternalParticipantSessionToken();
  if (token) {
    const existing = await resolveExternalParticipantContext(db, {
      organizationSlug,
      sessionToken: token,
    });
    if (existing) {
      redirect(
        `/participant/${encodeURIComponent(
          organizationSlug,
        )}/portal`,
      );
    }
  }

  const application =
    await findApplicationProfileByOrganizationSlug(
      db,
      organizationSlug,
    );
  const name =
    application?.profile?.applicationName ??
    application?.organization?.name ??
    "Participant portal";

  return (
    <main>
      <h1>{name} participant portal</h1>
      <p>
        Enter the tracking code and separate access secret issued when
        the submission was completed.
      </p>
      {error === "invalid_credentials" ? (
        <p role="alert">
          The tracking code or access secret was not accepted.
        </p>
      ) : null}
      {error === "rate_limited" ? (
        <p role="alert">
          Too many unsuccessful attempts were made. Try again later.
        </p>
      ) : null}
      {error === "session_required" ? (
        <p role="alert">
          Your participant session is unavailable or has expired.
        </p>
      ) : null}
      <form
        action={externalParticipantLoginAction.bind(
          null,
          organizationSlug,
        )}
      >
        <label>
          Tracking code
          <input
            name="trackingCode"
            required
            maxLength={200}
            autoComplete="off"
          />
        </label>
        <label>
          Access secret
          <input
            name="accessSecret"
            type="password"
            required
            minLength={32}
            maxLength={500}
            autoComplete="off"
          />
        </label>
        <button type="submit">Open participant portal</button>
      </form>
    </main>
  );
}
