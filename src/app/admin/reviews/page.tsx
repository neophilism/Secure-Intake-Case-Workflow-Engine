import Link from "next/link";
import { redirect } from "next/navigation";
import { getRuntimeDatabase } from "@/db/runtime";
import {
  hasPermission,
  requireTenantScope,
} from "@/modules/auth/authorization";
import { getCurrentAuthorizationContext } from "@/modules/auth/server-session";
import { listDeadlineCalendars } from "@/modules/deadlines/repository";
import {
  listReviewDashboard,
  listReviewPolicies,
  listReviewPolicyPrerequisites,
} from "@/modules/reviews/repository";
import {
  createReviewPolicyAction,
  setReviewPolicyStatusAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const context = await getCurrentAuthorizationContext();
  if (!context) redirect("/login");
  if (!context.tenantScope) redirect("/select-organization");
  if (!hasPermission(context, "review:view")) {
    redirect("/forbidden");
  }

  const { error } = await searchParams;
  const db = getRuntimeDatabase();
  const scope = requireTenantScope(context);
  const [policies, prerequisites, reviews, calendars] =
    await Promise.all([
      listReviewPolicies(db, scope),
      listReviewPolicyPrerequisites(db, scope),
      listReviewDashboard(db, scope),
      listDeadlineCalendars(db, scope),
    ]);
  const canManage = hasPermission(context, "review:manage");

  const prereqsByPolicy = new Map<
    string,
    typeof prerequisites
  >();
  for (const row of prerequisites) {
    const current =
      prereqsByPolicy.get(row.relation.policyId) ?? [];
    current.push(row);
    prereqsByPolicy.set(row.relation.policyId, current);
  }

  return (
    <main>
      <nav>
        <Link href="/admin/cases">Cases</Link>
        {" · "}
        <Link href="/admin/deadlines">Deadlines</Link>
        {" · "}
        <Link href="/admin/communications">
          Communications
        </Link>
        {" · "}
        <Link href="/admin/jobs">Jobs</Link>
        {" · "}
        <Link href="/admin/audit">Audit</Link>
      </nav>

      <h1>Reviews</h1>
      <p>
        Review policies define filing eligibility, hierarchy,
        timing, outcomes, and reviewer-independence rules.
      </p>

      {error ? (
        <p role="alert">
          The requested review operation failed ({error}).
        </p>
      ) : null}

      <section>
        <h2>Review queue</h2>
        {reviews.length === 0 ? (
          <p>No reviews have been filed.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Case</th>
                <th>Review</th>
                <th>Level</th>
                <th>Status</th>
                <th>Reviewer</th>
                <th>Filed</th>
                <th>Decision due</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {reviews.map(({ review, case: caseRecord, reviewer }) => (
                <tr key={review.id}>
                  <td>
                    <Link href={`/admin/cases/${caseRecord.id}`}>
                      {caseRecord.caseNumber}
                    </Link>
                  </td>
                  <td>{review.policyNameSnapshot}</td>
                  <td>{review.levelSnapshot}</td>
                  <td>
                    {review.status}
                    {review.decisionOverdueAt
                      ? " · overdue"
                      : ""}
                  </td>
                  <td>
                    {reviewer?.displayName ??
                      reviewer?.email ??
                      "—"}
                  </td>
                  <td>{review.filedAt.toISOString()}</td>
                  <td>
                    {review.decisionDueAt?.toISOString() ?? "—"}
                  </td>
                  <td>{review.outcome ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>Review policies</h2>
        {policies.length === 0 ? (
          <p>No review policies configured.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Key</th>
                <th>Name</th>
                <th>Level</th>
                <th>Status</th>
                <th>Eligible case states</th>
                <th>Prerequisites</th>
                <th>Outcomes</th>
                {canManage ? <th>Action</th> : null}
              </tr>
            </thead>
            <tbody>
              {policies.map((policy) => {
                const policyPrereqs =
                  prereqsByPolicy.get(policy.id) ?? [];
                return (
                  <tr key={policy.id}>
                    <td><code>{policy.key}</code></td>
                    <td>{policy.name}</td>
                    <td>{policy.level}</td>
                    <td>{policy.status}</td>
                    <td>
                      {policy.eligibleCaseStatuses.length
                        ? policy.eligibleCaseStatuses.join(", ")
                        : "any"}
                    </td>
                    <td>
                      {policyPrereqs.length
                        ? policyPrereqs
                            .map(
                              ({ prerequisite }) =>
                                prerequisite.name,
                            )
                            .join(", ")
                        : "case decision"}
                    </td>
                    <td>{policy.allowedOutcomes.join(", ")}</td>
                    {canManage ? (
                      <td>
                        <form
                          action={setReviewPolicyStatusAction.bind(
                            null,
                            policy.id,
                            policy.status === "active"
                              ? "inactive"
                              : "active",
                          )}
                        >
                          <button type="submit">
                            {policy.status === "active"
                              ? "Deactivate"
                              : "Activate"}
                          </button>
                        </form>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {canManage ? (
        <section>
          <h2>Create review policy</h2>
          <form action={createReviewPolicyAction}>
            <label>
              Stable key
              <input
                name="key"
                pattern="[a-z][a-z0-9_-]*"
                required
              />
            </label>
            <label>
              Name
              <input name="name" required />
            </label>
            <label>
              Description
              <textarea name="description" rows={3} />
            </label>
            <label>
              Level
              <input
                name="level"
                type="number"
                min={1}
                max={100}
                defaultValue={1}
                required
              />
            </label>
            <label>
              Eligible case statuses (comma-separated; blank = any)
              <input name="eligibleCaseStatuses" />
            </label>
            <fieldset>
              <legend>Filing window</legend>
              <label>
                Value
                <input
                  name="filingWindowValue"
                  type="number"
                  min={1}
                />
              </label>
              <label>
                Unit
                <select
                  name="filingWindowUnit"
                  defaultValue="calendar_days"
                >
                  <option value="hours">hours</option>
                  <option value="calendar_days">
                    calendar days
                  </option>
                  <option value="business_days">
                    business days
                  </option>
                </select>
              </label>
            </fieldset>
            <fieldset>
              <legend>Decision deadline</legend>
              <label>
                Value
                <input
                  name="decisionDeadlineValue"
                  type="number"
                  min={1}
                />
              </label>
              <label>
                Unit
                <select
                  name="decisionDeadlineUnit"
                  defaultValue="calendar_days"
                >
                  <option value="hours">hours</option>
                  <option value="calendar_days">
                    calendar days
                  </option>
                  <option value="business_days">
                    business days
                  </option>
                </select>
              </label>
              <label>
                Warning before
                <input
                  name="decisionWarningBeforeValue"
                  type="number"
                  min={1}
                />
              </label>
              <label>
                Warning unit
                <select
                  name="decisionWarningBeforeUnit"
                  defaultValue="calendar_days"
                >
                  <option value="hours">hours</option>
                  <option value="calendar_days">
                    calendar days
                  </option>
                  <option value="business_days">
                    business days
                  </option>
                </select>
              </label>
            </fieldset>
            <label>
              Deadline calendar
              <select name="calendarId" defaultValue="">
                <option value="">
                  none / UTC calendar-day behavior
                </option>
                {calendars
                  .filter(
                    (calendar) => calendar.status === "active",
                  )
                  .map((calendar) => (
                    <option
                      key={calendar.id}
                      value={calendar.id}
                    >
                      {calendar.name} ({calendar.timeZone})
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Allowed outcomes (comma-separated)
              <input
                name="allowedOutcomes"
                defaultValue="affirmed,modified,reversed,remanded,dismissed"
                required
              />
            </label>
            <label>
              Independent reviewer
              <select
                name="requireIndependentReviewer"
                defaultValue="true"
              >
                <option value="true">required</option>
                <option value="false">not required</option>
              </select>
            </label>
            <label>
              Prerequisite review policies
              <select
                name="prerequisitePolicyIds"
                multiple
              >
                {policies.map((policy) => (
                  <option
                    key={policy.id}
                    value={policy.id}
                  >
                    Level {policy.level}: {policy.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">Create review policy</button>
          </form>
        </section>
      ) : null}
    </main>
  );
}
