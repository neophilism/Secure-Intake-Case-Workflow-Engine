import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  gt,
  inArray,
  isNull,
  sql,
  type SQL,
} from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  caseDeadlines,
  caseQueues,
  caseReviews,
  caseSavedViews,
  caseTags,
  cases,
  organizationMemberships,
  users,
} from "@/db/schema";
import type { TenantScope } from "@/lib/tenancy";
import {
  parseCaseSearchDefinition,
  type CaseSearchDefinition,
} from "./definition";

const recentlyClosedDays = 7;

function searchConditions(
  scope: TenantScope,
  definition: CaseSearchDefinition,
  currentMembershipId: string,
): SQL[] {
  const conditions: SQL[] = [
    eq(cases.organizationId, scope.organizationId),
  ];

  if (definition.statuses.length) {
    conditions.push(inArray(cases.status, definition.statuses));
  }
  if (definition.priorities.length) {
    conditions.push(inArray(cases.priority, definition.priorities));
  }
  if (definition.queueIds.length) {
    conditions.push(inArray(cases.assignedQueueId, definition.queueIds));
  }
  if (definition.assigneeMembershipIds.length) {
    conditions.push(
      inArray(cases.assignedMembershipId, definition.assigneeMembershipIds),
    );
  }

  for (const tag of definition.tags) {
    conditions.push(sql\`exists (
      select 1
      from \${caseTags}
      where \${caseTags.organizationId} = \${cases.organizationId}
        and \${caseTags.caseId} = \${cases.id}
        and \${caseTags.tag} = \${tag}
    )\`);
  }

  if (definition.q) {
    const fuzzy = \`%\${definition.q}%\`;
    conditions.push(sql\`(
      to_tsvector(
        'simple',
        concat_ws(
          ' ',
          \${cases.caseNumber},
          \${cases.title},
          coalesce(\${cases.summary}, ''),
          \${cases.caseType}
        )
      ) @@ websearch_to_tsquery('simple', \${definition.q})
      or exists (
        select 1
        from \${caseTags}
        where \${caseTags.organizationId} = \${cases.organizationId}
          and \${caseTags.caseId} = \${cases.id}
          and \${caseTags.tag} ilike \${fuzzy}
      )
    )\`);
  }

  switch (definition.focus) {
    case "mine":
      conditions.push(eq(cases.assignedMembershipId, currentMembershipId));
      conditions.push(isNull(cases.closedAt));
      break;
    case "unassigned":
      conditions.push(isNull(cases.assignedMembershipId));
      conditions.push(isNull(cases.closedAt));
      break;
    case "overdue":
      conditions.push(isNull(cases.closedAt));
      conditions.push(sql\`exists (
        select 1
        from \${caseDeadlines}
        where \${caseDeadlines.organizationId} = \${cases.organizationId}
          and \${caseDeadlines.caseId} = \${cases.id}
          and \${caseDeadlines.status} = 'overdue'
      )\`);
      break;
    case "escalated":
      conditions.push(isNull(cases.closedAt));
      conditions.push(gt(cases.escalationLevel, 0));
      break;
    case "open_review":
      conditions.push(isNull(cases.closedAt));
      conditions.push(sql\`exists (
        select 1
        from \${caseReviews}
        where \${caseReviews.organizationId} = \${cases.organizationId}
          and \${caseReviews.caseId} = \${cases.id}
          and \${caseReviews.status} in ('filed', 'assigned', 'under_review')
      )\`);
      break;
    case "recently_closed":
      conditions.push(
        gte(
          cases.closedAt,
          new Date(
            Date.now() - recentlyClosedDays * 24 * 60 * 60 * 1000,
          ),
        ),
      );
      break;
    case "all":
      break;
  }

  return conditions;
}

export async function searchCases(
  db: Database,
  scope: TenantScope,
  definition: CaseSearchDefinition,
  currentMembershipId: string,
) {
  const conditions = searchConditions(
    scope,
    definition,
    currentMembershipId,
  );
  const priorityWeight = sql<number>\`case lower(\${cases.priority})
    when 'critical' then 5
    when 'urgent' then 4
    when 'high' then 3
    when 'normal' then 2
    when 'low' then 1
    else 0 end\`;

  const order =
    definition.sort === "created_desc"
      ? [desc(cases.createdAt), desc(cases.updatedAt)]
      : definition.sort === "priority_desc"
        ? [desc(priorityWeight), desc(cases.updatedAt)]
        : [desc(cases.updatedAt), desc(cases.createdAt)];

  return db
    .select({
      id: cases.id,
      caseNumber: cases.caseNumber,
      caseType: cases.caseType,
      title: cases.title,
      summary: cases.summary,
      status: cases.status,
      priority: cases.priority,
      assignedQueueId: cases.assignedQueueId,
      assignedMembershipId: cases.assignedMembershipId,
      escalationLevel: cases.escalationLevel,
      closedAt: cases.closedAt,
      createdAt: cases.createdAt,
      updatedAt: cases.updatedAt,
      queueName: caseQueues.name,
      assigneeDisplayName: users.displayName,
      assigneeEmail: users.email,
      hasOverdueDeadline: sql<boolean>\`exists (
        select 1
        from \${caseDeadlines}
        where \${caseDeadlines.organizationId} = \${cases.organizationId}
          and \${caseDeadlines.caseId} = \${cases.id}
          and \${caseDeadlines.status} = 'overdue'
      )\`,
      hasOpenReview: sql<boolean>\`exists (
        select 1
        from \${caseReviews}
        where \${caseReviews.organizationId} = \${cases.organizationId}
          and \${caseReviews.caseId} = \${cases.id}
          and \${caseReviews.status} in ('filed', 'assigned', 'under_review')
      )\`,
    })
    .from(cases)
    .leftJoin(
      caseQueues,
      and(
        eq(caseQueues.id, cases.assignedQueueId),
        eq(caseQueues.organizationId, cases.organizationId),
      ),
    )
    .leftJoin(
      organizationMemberships,
      and(
        eq(organizationMemberships.id, cases.assignedMembershipId),
        eq(
          organizationMemberships.organizationId,
          cases.organizationId,
        ),
      ),
    )
    .leftJoin(users, eq(users.id, organizationMemberships.userId))
    .where(and(...conditions))
    .orderBy(...order)
    .limit(definition.limit);
}

async function countCases(
  db: Database,
  scope: TenantScope,
  definition: CaseSearchDefinition,
  currentMembershipId: string,
) {
  const [row] = await db
    .select({ value: count() })
    .from(cases)
    .where(
      and(
        ...searchConditions(
          scope,
          definition,
          currentMembershipId,
        ),
      ),
    );

  return Number(row?.value ?? 0);
}

function focusDefinition(
  focus: CaseSearchDefinition["focus"],
): CaseSearchDefinition {
  return parseCaseSearchDefinition({
    statuses: [],
    priorities: [],
    queueIds: [],
    assigneeMembershipIds: [],
    tags: [],
    focus,
    sort: "updated_desc",
    limit: 50,
  });
}

export async function getOperationalDashboard(
  db: Database,
  scope: TenantScope,
  currentMembershipId: string,
) {
  const [mine, unassigned, overdue, escalated, openReview, recentlyClosed] =
    await Promise.all([
      countCases(db, scope, focusDefinition("mine"), currentMembershipId),
      countCases(db, scope, focusDefinition("unassigned"), currentMembershipId),
      countCases(db, scope, focusDefinition("overdue"), currentMembershipId),
      countCases(db, scope, focusDefinition("escalated"), currentMembershipId),
      countCases(db, scope, focusDefinition("open_review"), currentMembershipId),
      countCases(
        db,
        scope,
        focusDefinition("recently_closed"),
        currentMembershipId,
      ),
    ]);

  const [row] = await db
    .select({ value: count() })
    .from(cases)
    .where(
      and(
        eq(cases.organizationId, scope.organizationId),
        isNull(cases.closedAt),
      ),
    );

  return {
    open: Number(row?.value ?? 0),
    mine,
    unassigned,
    overdue,
    escalated,
    openReview,
    recentlyClosed,
  };
}

export async function listQueueWorkload(
  db: Database,
  scope: TenantScope,
) {
  return db
    .select({
      queueId: caseQueues.id,
      queueName: caseQueues.name,
      queueStatus: caseQueues.status,
      caseCount: count(cases.id),
    })
    .from(caseQueues)
    .leftJoin(
      cases,
      and(
        eq(cases.assignedQueueId, caseQueues.id),
        eq(cases.organizationId, caseQueues.organizationId),
        isNull(cases.closedAt),
      ),
    )
    .where(eq(caseQueues.organizationId, scope.organizationId))
    .groupBy(caseQueues.id, caseQueues.name, caseQueues.status)
    .orderBy(desc(count(cases.id)), asc(caseQueues.name));
}

export async function listMemberWorkload(
  db: Database,
  scope: TenantScope,
) {
  return db
    .select({
      membershipId: organizationMemberships.id,
      displayName: users.displayName,
      email: users.email,
      title: organizationMemberships.title,
      caseCount: count(cases.id),
    })
    .from(organizationMemberships)
    .innerJoin(users, eq(users.id, organizationMemberships.userId))
    .leftJoin(
      cases,
      and(
        eq(cases.assignedMembershipId, organizationMemberships.id),
        eq(
          cases.organizationId,
          organizationMemberships.organizationId,
        ),
        isNull(cases.closedAt),
      ),
    )
    .where(
      and(
        eq(
          organizationMemberships.organizationId,
          scope.organizationId,
        ),
        eq(organizationMemberships.status, "active"),
        eq(users.status, "active"),
      ),
    )
    .groupBy(
      organizationMemberships.id,
      users.displayName,
      users.email,
      organizationMemberships.title,
    )
    .orderBy(
      desc(count(cases.id)),
      asc(users.displayName),
      asc(users.email),
    );
}

export async function listSavedViews(
  db: Database,
  scope: TenantScope,
  ownerMembershipId: string,
) {
  return db
    .select()
    .from(caseSavedViews)
    .where(
      and(
        eq(caseSavedViews.organizationId, scope.organizationId),
        eq(caseSavedViews.ownerMembershipId, ownerMembershipId),
      ),
    )
    .orderBy(desc(caseSavedViews.isDefault), asc(caseSavedViews.name));
}

export async function createSavedView(
  db: Database,
  scope: TenantScope,
  input: {
    ownerMembershipId: string;
    name: string;
    definition: CaseSearchDefinition;
    isDefault?: boolean;
  },
) {
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new Error("Saved view name is required.");
  const definition = parseCaseSearchDefinition(input.definition);

  return db.transaction(async (tx) => {
    if (input.isDefault) {
      await tx
        .update(caseSavedViews)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(
          and(
            eq(caseSavedViews.organizationId, scope.organizationId),
            eq(
              caseSavedViews.ownerMembershipId,
              input.ownerMembershipId,
            ),
          ),
        );
    }

    const [view] = await tx
      .insert(caseSavedViews)
      .values({
        organizationId: scope.organizationId,
        ownerMembershipId: input.ownerMembershipId,
        name,
        definition,
        isDefault: Boolean(input.isDefault),
      })
      .returning();

    return view;
  });
}

export async function setDefaultSavedView(
  db: Database,
  scope: TenantScope,
  ownerMembershipId: string,
  viewId: string,
) {
  return db.transaction(async (tx) => {
    await tx
      .update(caseSavedViews)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(
        and(
          eq(caseSavedViews.organizationId, scope.organizationId),
          eq(caseSavedViews.ownerMembershipId, ownerMembershipId),
        ),
      );

    const [view] = await tx
      .update(caseSavedViews)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(
        and(
          eq(caseSavedViews.id, viewId),
          eq(caseSavedViews.organizationId, scope.organizationId),
          eq(caseSavedViews.ownerMembershipId, ownerMembershipId),
        ),
      )
      .returning();

    if (!view) throw new Error("Saved view not found.");
    return view;
  });
}

export async function deleteSavedView(
  db: Database,
  scope: TenantScope,
  ownerMembershipId: string,
  viewId: string,
) {
  const [deleted] = await db
    .delete(caseSavedViews)
    .where(
      and(
        eq(caseSavedViews.id, viewId),
        eq(caseSavedViews.organizationId, scope.organizationId),
        eq(caseSavedViews.ownerMembershipId, ownerMembershipId),
      ),
    )
    .returning();

  return deleted ?? null;
}
