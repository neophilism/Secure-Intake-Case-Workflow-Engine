import { sql } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("organizations_slug_idx").on(table.slug)],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("users_email_idx").on(table.email)],
);

export const userCredentials = pgTable("user_credentials", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(),
  passwordUpdatedAt: timestamp("password_updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const authIdentities = pgTable(
  "auth_identities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    subject: text("subject").notNull(),
    email: text("email"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("auth_identities_user_idx").on(table.userId),
    uniqueIndex("auth_identities_provider_subject_idx").on(
      table.provider,
      table.subject,
    ),
  ],
);

export const offices = pgTable(
  "offices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    parentOfficeId: uuid("parent_office_id"),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("offices_organization_idx").on(table.organizationId),
    uniqueIndex("offices_org_slug_idx").on(table.organizationId, table.slug),
    foreignKey({
      columns: [table.parentOfficeId],
      foreignColumns: [table.id],
      name: "offices_parent_office_fk",
    }).onDelete("set null"),
  ],
);

export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("active"),
    title: text("title"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("organization_memberships_organization_idx").on(table.organizationId),
    index("organization_memberships_user_idx").on(table.userId),
    uniqueIndex("organization_memberships_org_user_idx").on(
      table.organizationId,
      table.userId,
    ),
  ],
);

export const officeMemberships = pgTable(
  "office_memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    organizationMembershipId: uuid("organization_membership_id")
      .notNull()
      .references(() => organizationMemberships.id, { onDelete: "cascade" }),
    officeId: uuid("office_id")
      .notNull()
      .references(() => offices.id, { onDelete: "cascade" }),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("office_memberships_organization_idx").on(table.organizationId),
    uniqueIndex("office_memberships_membership_office_idx").on(
      table.organizationMembershipId,
      table.officeId,
    ),
  ],
);

export const organizationInvitations = pgTable(
  "organization_invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("organization_invitations_organization_idx").on(table.organizationId),
    uniqueIndex("organization_invitations_token_hash_idx").on(table.tokenHash),
  ],
);

export const roles = pgTable(
  "roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    isSystem: boolean("is_system").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("roles_organization_idx").on(table.organizationId),
    uniqueIndex("roles_org_key_idx").on(table.organizationId, table.key),
  ],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permission: text("permission").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("role_permissions_organization_idx").on(table.organizationId),
    uniqueIndex("role_permissions_role_permission_idx").on(
      table.roleId,
      table.permission,
    ),
  ],
);

export const membershipRoles = pgTable(
  "membership_roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    organizationMembershipId: uuid("organization_membership_id")
      .notNull()
      .references(() => organizationMemberships.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("membership_roles_organization_idx").on(table.organizationId),
    uniqueIndex("membership_roles_membership_role_idx").on(
      table.organizationMembershipId,
      table.roleId,
    ),
  ],
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    activeOrganizationId: uuid("active_organization_id").references(
      () => organizations.id,
      { onDelete: "set null" },
    ),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("auth_sessions_user_idx").on(table.userId),
    uniqueIndex("auth_sessions_token_hash_idx").on(table.tokenHash),
  ],
);


export const intakeForms = pgTable(
  "intake_forms",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    accessMode: text("access_mode").notNull().default("public"),
    status: text("status").notNull().default("active"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("intake_forms_organization_idx").on(table.organizationId),
    uniqueIndex("intake_forms_org_slug_idx").on(
      table.organizationId,
      table.slug,
    ),
  ],
);

export const intakeFormVersions = pgTable(
  "intake_form_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    formId: uuid("form_id")
      .notNull()
      .references(() => intakeForms.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    definition: jsonb("definition")
      .$type<Record<string, unknown>>()
      .notNull(),
    status: text("status").notNull().default("draft"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("intake_form_versions_organization_idx").on(table.organizationId),
    index("intake_form_versions_form_idx").on(table.formId),
    uniqueIndex("intake_form_versions_form_number_idx").on(
      table.formId,
      table.versionNumber,
    ),
    uniqueIndex("intake_form_versions_one_published_idx")
      .on(table.formId)
      .where(sql`${table.status} = 'published'`),
  ],
);

export const intakeSubmissions = pgTable(
  "intake_submissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    formId: uuid("form_id")
      .notNull()
      .references(() => intakeForms.id, { onDelete: "restrict" }),
    formVersionId: uuid("form_version_id")
      .notNull()
      .references(() => intakeFormVersions.id, { onDelete: "restrict" }),
    submitterUserId: uuid("submitter_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("draft"),
    answers: jsonb("answers")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    draftTokenHash: text("draft_token_hash"),
    confirmationCode: text("confirmation_code"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("intake_submissions_organization_idx").on(table.organizationId),
    index("intake_submissions_form_idx").on(table.formId),
    uniqueIndex("intake_submissions_draft_token_hash_idx").on(
      table.draftTokenHash,
    ),
    uniqueIndex("intake_submissions_confirmation_code_idx").on(
      table.confirmationCode,
    ),
  ],
);



export const caseWorkflows = pgTable(
  "case_workflows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").notNull().default("active"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("case_workflows_organization_idx").on(table.organizationId),
    uniqueIndex("case_workflows_org_slug_idx").on(
      table.organizationId,
      table.slug,
    ),
  ],
);

export const caseWorkflowVersions = pgTable(
  "case_workflow_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => caseWorkflows.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    definition: jsonb("definition")
      .$type<Record<string, unknown>>()
      .notNull(),
    status: text("status").notNull().default("draft"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("case_workflow_versions_organization_idx").on(table.organizationId),
    index("case_workflow_versions_workflow_idx").on(table.workflowId),
    uniqueIndex("case_workflow_versions_workflow_number_idx").on(
      table.workflowId,
      table.versionNumber,
    ),
    uniqueIndex("case_workflow_versions_one_published_idx")
      .on(table.workflowId)
      .where(sql`${table.status} = 'published'`),
  ],
);

export const intakeFormWorkflowBindings = pgTable(
  "intake_form_workflow_bindings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    formId: uuid("form_id")
      .notNull()
      .references(() => intakeForms.id, { onDelete: "cascade" }),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => caseWorkflows.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("intake_form_workflow_bindings_organization_idx").on(table.organizationId),
    uniqueIndex("intake_form_workflow_bindings_form_idx").on(table.formId),
  ],
);


export const caseTeams = pgTable(
  "case_teams",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    officeId: uuid("office_id").references(() => offices.id, {
      onDelete: "set null",
    }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").notNull().default("active"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("case_teams_organization_idx").on(table.organizationId),
    uniqueIndex("case_teams_org_slug_idx").on(
      table.organizationId,
      table.slug,
    ),
  ],
);

export const caseTeamMemberships = pgTable(
  "case_team_memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => caseTeams.id, { onDelete: "cascade" }),
    organizationMembershipId: uuid("organization_membership_id")
      .notNull()
      .references(() => organizationMemberships.id, {
        onDelete: "cascade",
      }),
    isAvailable: boolean("is_available").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("case_team_memberships_organization_idx").on(table.organizationId),
    index("case_team_memberships_team_idx").on(table.teamId),
    uniqueIndex("case_team_memberships_team_member_idx").on(
      table.teamId,
      table.organizationMembershipId,
    ),
  ],
);

export const caseQueues = pgTable(
  "case_queues",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").references(() => caseTeams.id, {
      onDelete: "set null",
    }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    assignmentStrategy: text("assignment_strategy")
      .notNull()
      .default("manual"),
    status: text("status").notNull().default("active"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("case_queues_organization_idx").on(table.organizationId),
    uniqueIndex("case_queues_org_slug_idx").on(
      table.organizationId,
      table.slug,
    ),
  ],
);

export const queueAssignmentCursors = pgTable(
  "queue_assignment_cursors",
  {
    queueId: uuid("queue_id")
      .primaryKey()
      .references(() => caseQueues.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    cursorValue: integer("cursor_value").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("queue_assignment_cursors_organization_idx").on(
      table.organizationId,
    ),
  ],
);

export const caseRoutingRules = pgTable(
  "case_routing_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    priority: integer("priority").notNull().default(100),
    status: text("status").notNull().default("active"),
    definition: jsonb("definition")
      .$type<Record<string, unknown>>()
      .notNull(),
    targetQueueId: uuid("target_queue_id")
      .notNull()
      .references(() => caseQueues.id, { onDelete: "restrict" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("case_routing_rules_organization_idx").on(table.organizationId),
    index("case_routing_rules_priority_idx").on(
      table.organizationId,
      table.priority,
    ),
  ],
);

export const caseNumberSequences = pgTable(
  "case_number_sequences",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    calendarYear: integer("calendar_year").notNull(),
    lastValue: integer("last_value").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("case_number_sequences_org_year_idx").on(
      table.organizationId,
      table.calendarYear,
    ),
  ],
);

export const cases = pgTable(
  "cases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    caseNumber: text("case_number").notNull(),
    sourceSubmissionId: uuid("source_submission_id").references(
      () => intakeSubmissions.id,
      { onDelete: "restrict" },
    ),
    caseType: text("case_type").notNull().default("general"),
    workflowVersionId: uuid("workflow_version_id").references(
      () => caseWorkflowVersions.id,
      { onDelete: "restrict" },
    ),
    workflowDefinition: jsonb("workflow_definition")
      .$type<Record<string, unknown>>()
      .notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    status: text("status").notNull().default("intake_review"),
    priority: text("priority").notNull().default("normal"),
    disposition: text("disposition"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    assignedQueueId: uuid("assigned_queue_id").references(
      () => caseQueues.id,
      { onDelete: "set null" },
    ),
    assignedMembershipId: uuid("assigned_membership_id").references(
      () => organizationMemberships.id,
      { onDelete: "set null" },
    ),
    assignedAt: timestamp("assigned_at", { withTimezone: true }),
    escalationLevel: integer("escalation_level").notNull().default(0),
    escalatedAt: timestamp("escalated_at", { withTimezone: true }),
    escalationReason: text("escalation_reason"),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("cases_organization_idx").on(table.organizationId),
    index("cases_status_idx").on(table.organizationId, table.status),
    index("cases_workflow_version_idx").on(table.workflowVersionId),
    index("cases_queue_idx").on(table.organizationId, table.assignedQueueId),
    index("cases_assignee_idx").on(
      table.organizationId,
      table.assignedMembershipId,
    ),
    uniqueIndex("cases_org_number_idx").on(
      table.organizationId,
      table.caseNumber,
    ),
    uniqueIndex("cases_source_submission_idx").on(table.sourceSubmissionId),
  ],
);

export const caseStatusHistory = pgTable(
  "case_status_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    workflowVersionId: uuid("workflow_version_id").references(
      () => caseWorkflowVersions.id,
      { onDelete: "restrict" },
    ),
    transitionKey: text("transition_key"),
    note: text("note"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("case_status_history_organization_idx").on(table.organizationId),
    index("case_status_history_case_idx").on(table.caseId, table.createdAt),
  ],
);

export const caseTags = pgTable(
  "case_tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("case_tags_organization_idx").on(table.organizationId),
    uniqueIndex("case_tags_case_tag_idx").on(table.caseId, table.tag),
  ],
);


export const caseAssignmentHistory = pgTable(
  "case_assignment_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    fromQueueId: uuid("from_queue_id").references(() => caseQueues.id, {
      onDelete: "set null",
    }),
    toQueueId: uuid("to_queue_id").references(() => caseQueues.id, {
      onDelete: "set null",
    }),
    fromMembershipId: uuid("from_membership_id").references(
      () => organizationMemberships.id,
      { onDelete: "set null" },
    ),
    toMembershipId: uuid("to_membership_id").references(
      () => organizationMemberships.id,
      { onDelete: "set null" },
    ),
    source: text("source").notNull(),
    routingRuleId: uuid("routing_rule_id").references(
      () => caseRoutingRules.id,
      { onDelete: "set null" },
    ),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reason: text("reason"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("case_assignment_history_organization_idx").on(
      table.organizationId,
    ),
    index("case_assignment_history_case_idx").on(
      table.caseId,
      table.createdAt,
    ),
  ],
);


export const documentTypes = pgTable(
  "document_types",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").notNull().default("active"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("document_types_organization_idx").on(table.organizationId),
    uniqueIndex("document_types_org_key_idx").on(
      table.organizationId,
      table.key,
    ),
  ],
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    documentTypeId: uuid("document_type_id")
      .notNull()
      .references(() => documentTypes.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    description: text("description"),
    visibility: text("visibility").notNull().default("internal"),
    status: text("status").notNull().default("active"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("documents_organization_idx").on(table.organizationId),
    index("documents_type_idx").on(table.organizationId, table.documentTypeId),
  ],
);

export const documentVersions = pgTable(
  "document_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    originalFilename: text("original_filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    storageDriver: text("storage_driver").notNull(),
    storageKey: text("storage_key").notNull(),
    contentStatus: text("content_status").notNull().default("quarantined"),
    malwareScanStatus: text("malware_scan_status").notNull().default("pending"),
    malwareScanProvider: text("malware_scan_provider"),
    malwareScanDetails: jsonb("malware_scan_details")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    malwareScannedAt: timestamp("malware_scanned_at", { withTimezone: true }),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("document_versions_organization_idx").on(table.organizationId),
    index("document_versions_document_idx").on(table.documentId),
    uniqueIndex("document_versions_document_number_idx").on(
      table.documentId,
      table.versionNumber,
    ),
    uniqueIndex("document_versions_storage_idx").on(
      table.storageDriver,
      table.storageKey,
    ),
  ],
);

export const documentCaseLinks = pgTable(
  "document_case_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    documentVersionId: uuid("document_version_id")
      .notNull()
      .references(() => documentVersions.id, { onDelete: "restrict" }),
    relationship: text("relationship").notNull().default("evidence"),
    evidenceDescription: text("evidence_description"),
    sourceDescription: text("source_description"),
    exhibitLabel: text("exhibit_label"),
    attachedByUserId: uuid("attached_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    attachedAt: timestamp("attached_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("document_case_links_organization_idx").on(table.organizationId),
    index("document_case_links_case_idx").on(table.caseId),
    uniqueIndex("document_case_links_case_version_idx").on(
      table.caseId,
      table.documentVersionId,
    ),
  ],
);

export const documentSubmissionLinks = pgTable(
  "document_submission_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => intakeSubmissions.id, { onDelete: "cascade" }),
    documentVersionId: uuid("document_version_id")
      .notNull()
      .references(() => documentVersions.id, { onDelete: "restrict" }),
    formFieldId: text("form_field_id"),
    attachedByUserId: uuid("attached_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    attachedAt: timestamp("attached_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("document_submission_links_organization_idx").on(table.organizationId),
    index("document_submission_links_submission_idx").on(table.submissionId),
    uniqueIndex("document_submission_links_submission_version_idx").on(
      table.submissionId,
      table.documentVersionId,
    ),
  ],
);

export const documentCustodyEvents = pgTable(
  "document_custody_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    documentVersionId: uuid("document_version_id")
      .notNull()
      .references(() => documentVersions.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    fromCustodian: text("from_custodian"),
    toCustodian: text("to_custodian"),
    location: text("location"),
    note: text("note"),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("document_custody_events_organization_idx").on(table.organizationId),
    index("document_custody_events_version_idx").on(
      table.documentVersionId,
      table.occurredAt,
    ),
  ],
);

export const documentAccessEvents = pgTable(
  "document_access_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    documentVersionId: uuid("document_version_id")
      .notNull()
      .references(() => documentVersions.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("document_access_events_organization_idx").on(table.organizationId),
    index("document_access_events_version_idx").on(
      table.documentVersionId,
      table.createdAt,
    ),
  ],
);

