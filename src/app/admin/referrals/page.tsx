import Link from "next/link";
import { redirect } from "next/navigation";
import { getRuntimeDatabase } from "@/db/runtime";
import {
  hasPermission,
  requireTenantScope,
} from "@/modules/auth/authorization";
import { getCurrentAuthorizationContext } from "@/modules/auth/server-session";
import {
  listReferralDashboard,
  listReferralDeadlines,
} from "@/modules/referrals/repository";

export const dynamic = "force-dynamic";

export default async function ReferralsPage() {
  const context = await getCurrentAuthorizationContext();
  if (!context) redirect("/login");
  if (!context.tenantScope) redirect("/select-organization");
  if (!hasPermission(context, "referral:view")) {
    redirect("/forbidden");
  }

  const db = getRuntimeDatabase();
  const scope = requireTenantScope(context);
  const rows = await listReferralDashboard(db, scope);
  const deadlinesByReferral = new Map(
    await Promise.all(
      rows.map(async ({ referral }) => [
        referral.id,
        await listReferralDeadlines(db, scope, referral.id),
      ] as const),
    ),
  );

  return (
    <main>
      <nav>
        <Link href="/admin/cases">Cases</Link>
        {" · "}
        <Link href="/admin/deadlines">Deadlines</Link>
        {" · "}
        <Link href="/admin/audit">Audit</Link>
      </nav>
      <h1>Referrals</h1>
      <p>
        Independent external referral work items and their response
        clocks.
      </p>

      {rows.length === 0 ? (
        <p>No referrals have been created.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Case</th>
              <th>Recipient</th>
              <th>Policy</th>
              <th>Status</th>
              <th>Sent</th>
              <th>Acknowledged</th>
              <th>Open deadlines</th>
              <th>Next due</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ referral, case: record, policy }) => {
              const deadlines =
                deadlinesByReferral.get(referral.id) ?? [];
              const open = deadlines.filter((deadline) =>
                ["active", "paused", "overdue"].includes(
                  deadline.status,
                ),
              );
              const nextDue = [...open].sort(
                (a, b) =>
                  a.dueAt.getTime() - b.dueAt.getTime(),
              )[0];

              return (
                <tr key={referral.id}>
                  <td>
                    <Link href={"/admin/cases/" + record.id}>
                      {record.caseNumber}
                    </Link>
                  </td>
                  <td>{referral.recipientName}</td>
                  <td>{policy.name}</td>
                  <td>{referral.status}</td>
                  <td>{referral.sentAt?.toISOString() ?? "—"}</td>
                  <td>
                    {referral.acknowledgedAt?.toISOString() ?? "—"}
                  </td>
                  <td>
                    {open.length}
                    {open.some(
                      (deadline) => deadline.status === "overdue",
                    )
                      ? " — overdue"
                      : ""}
                  </td>
                  <td>{nextDue?.dueAt.toISOString() ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
