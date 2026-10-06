import Link from "next/link";
import { redirect } from "next/navigation";
import { getRuntimeDatabase } from "@/db/runtime";
import {
  hasPermission,
  requireTenantScope,
} from "@/modules/auth/authorization";
import { getCurrentAuthorizationContext } from "@/modules/auth/server-session";
import { listOffices } from "@/modules/organizations/repository";
import {
  listOrganizationMembers,
  listQueues,
  listRoutingRules,
  listTeamMembers,
  listTeams,
} from "@/modules/routing/repository";
import { starterRoutingRuleDefinition } from "@/modules/routing/starter-rule";
import {
  addTeamMemberAction,
  createQueueAction,
  createRoutingRuleAction,
  createTeamAction,
  setTeamMemberAvailabilityAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function RoutingAdministrationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const context = await getCurrentAuthorizationContext();
  if (!context) redirect("/login");
  if (!context.tenantScope) redirect("/select-organization");
  if (!hasPermission(context, "routing:view")) {
    redirect("/forbidden");
  }

  const scope = requireTenantScope(context);
  const db = getRuntimeDatabase();
  const [teams, queues, rules, members, teamMembers, offices] =
    await Promise.all([
      listTeams(db, scope),
      listQueues(db, scope),
      listRoutingRules(db, scope),
      listOrganizationMembers(db, scope),
      listTeamMembers(db, scope),
      listOffices(db, scope),
    ]);
  const { error } = await searchParams;
  const canManage = hasPermission(context, "routing:manage");
  const memberById = new Map(
    members.map((member) => [member.membershipId, member]),
  );
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const queueById = new Map(queues.map((queue) => [queue.id, queue]));

  return (
    <main>
      <nav>
        <Link href="/admin/organizations">Organization</Link>
        {" · "}
        <Link href="/admin/forms">Forms</Link>
        {" · "}
        <Link href="/admin/workflows">Workflows</Link>
        {" · "}
        <Link href="/admin/documents">Documents</Link>
        {" · "}
        <Link href="/admin/cases">Cases</Link>
        {" · "}
        <Link href="/admin/deadlines">Deadlines</Link>
        {" · "}
        <Link href="/admin/reviews">Reviews</Link>
        {" · "}
        <Link href="/admin/disclosures">Disclosures</Link>
        {" · "}
        <Link href="/admin/communications">Communications</Link>
        {" · "}
        <Link href="/notifications">Notifications</Link>
        {" · "}
        <Link href="/admin/jobs">Jobs</Link>
        {" · "}
        <Link href="/admin/audit">Audit</Link>
      </nav>

      <h1>Assignment & routing</h1>
      <p>
        Teams group staff. Queues hold work. Routing rules select queues;
        queue strategy determines whether a worker is assigned automatically.
      </p>

      {error ? (
        <p role="alert">
          The requested routing operation could not be completed ({error}).
        </p>
      ) : null}

      <section>
        <h2>Teams</h2>
        {teams.length === 0 ? (
          <p>No routing teams are configured.</p>
        ) : (
          teams.map((team) => (
            <article key={team.id}>
              <h3>{team.name}</h3>
              <p>
                <code>{team.slug}</code>
                {team.officeId
                  ? ` · office ${team.officeId}`
                  : ""}
              </p>
              {team.description ? <p>{team.description}</p> : null}

              <h4>Members</h4>
              <ul>
                {teamMembers
                  .filter((member) => member.teamId === team.id)
                  .map((member) => (
                    <li key={member.id}>
                      {member.displayName ?? member.email}
                      {member.title ? ` — ${member.title}` : ""}
                      {" — "}
                      {member.isAvailable
                        ? "available"
                        : "unavailable"}
                      {canManage ? (
                        <form
                          action={
                            setTeamMemberAvailabilityAction
                          }
                        >
                          <input
                            type="hidden"
                            name="teamMembershipId"
                            value={member.id}
                          />
                          <input
                            type="hidden"
                            name="isAvailable"
                            value={
                              member.isAvailable
                                ? "false"
                                : "true"
                            }
                          />
                          <button type="submit">
                            Mark{" "}
                            {member.isAvailable
                              ? "unavailable"
                              : "available"}
                          </button>
                        </form>
                      ) : null}
                    </li>
                  ))}
              </ul>

              {canManage ? (
                <form action={addTeamMemberAction}>
                  <input
                    type="hidden"
                    name="teamId"
                    value={team.id}
                  />
                  <label>
                    Add member
                    <select name="membershipId" required defaultValue="">
                      <option value="" disabled>
                        Select member
                      </option>
                      {members.map((member) => (
                        <option
                          key={member.membershipId}
                          value={member.membershipId}
                        >
                          {member.displayName ?? member.email}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="submit">Add to team</button>
                </form>
              ) : null}
            </article>
          ))
        )}
      </section>

      <section>
        <h2>Queues</h2>
        {queues.length === 0 ? (
          <p>No queues are configured.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Queue</th>
                <th>Team</th>
                <th>Strategy</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {queues.map((queue) => (
                <tr key={queue.id}>
                  <td>{queue.name}</td>
                  <td>
                    {queue.teamId
                      ? teamById.get(queue.teamId)?.name ??
                        queue.teamId
                      : "None"}
                  </td>
                  <td>{queue.assignmentStrategy}</td>
                  <td>{queue.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>Routing rules</h2>
        <p>
          Lower priority numbers run first. The first active matching rule
          wins.
        </p>
        {rules.length === 0 ? (
          <p>No routing rules are configured.</p>
        ) : (
          <ol>
            {rules.map((rule) => (
              <li key={rule.id}>
                Priority {rule.priority}: {rule.name} →{" "}
                {queueById.get(rule.targetQueueId)?.name ??
                  rule.targetQueueId}
                <pre>
                  {JSON.stringify(rule.parsedDefinition, null, 2)}
                </pre>
              </li>
            ))}
          </ol>
        )}
      </section>

      {canManage ? (
        <>
          <section>
            <h2>Create team</h2>
            <form action={createTeamAction}>
              <label>
                Name
                <input name="name" required />
              </label>
              <label>
                Slug
                <input
                  name="slug"
                  required
                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                />
              </label>
              <label>
                Office (optional)
                <select name="officeId" defaultValue="">
                  <option value="">No office binding</option>
                  {offices.map((office) => (
                    <option key={office.id} value={office.id}>
                      {office.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Description
                <textarea name="description" rows={3} />
              </label>
              <button type="submit">Create team</button>
            </form>
          </section>

          <section>
            <h2>Create queue</h2>
            <form action={createQueueAction}>
              <label>
                Name
                <input name="name" required />
              </label>
              <label>
                Slug
                <input
                  name="slug"
                  required
                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                />
              </label>
              <label>
                Team
                <select name="teamId" defaultValue="">
                  <option value="">No team</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Assignment strategy
                <select
                  name="assignmentStrategy"
                  defaultValue="manual"
                >
                  <option value="manual">Manual</option>
                  <option value="round_robin">
                    Round robin
                  </option>
                </select>
              </label>
              <label>
                Description
                <textarea name="description" rows={3} />
              </label>
              <button type="submit">Create queue</button>
            </form>
          </section>

          <section>
            <h2>Create routing rule</h2>
            {queues.length === 0 ? (
              <p>Create a queue before adding routing rules.</p>
            ) : (
              <form action={createRoutingRuleAction}>
                <label>
                  Name
                  <input name="name" required />
                </label>
                <label>
                  Priority
                  <input
                    name="priority"
                    type="number"
                    step="1"
                    defaultValue="100"
                    required
                  />
                </label>
                <label>
                  Target queue
                  <select
                    name="targetQueueId"
                    required
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Select queue
                    </option>
                    {queues.map((queue) => (
                      <option key={queue.id} value={queue.id}>
                        {queue.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Rule definition JSON
                  <textarea
                    name="definition"
                    rows={18}
                    cols={100}
                    required
                    defaultValue={JSON.stringify(
                      starterRoutingRuleDefinition,
                      null,
                      2,
                    )}
                  />
                </label>
                <button type="submit">
                  Create routing rule
                </button>
              </form>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}
