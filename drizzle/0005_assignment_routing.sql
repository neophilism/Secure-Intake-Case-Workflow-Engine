CREATE TABLE IF NOT EXISTS "case_teams" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "office_id" uuid REFERENCES "offices"("id") ON DELETE SET NULL,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "status" text DEFAULT 'active' NOT NULL,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_teams_organization_idx" ON "case_teams" ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "case_teams_org_slug_idx" ON "case_teams" ("organization_id", "slug");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "case_team_memberships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "team_id" uuid NOT NULL REFERENCES "case_teams"("id") ON DELETE CASCADE,
  "organization_membership_id" uuid NOT NULL REFERENCES "organization_memberships"("id") ON DELETE CASCADE,
  "is_available" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_team_memberships_organization_idx" ON "case_team_memberships" ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_team_memberships_team_idx" ON "case_team_memberships" ("team_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "case_team_memberships_team_member_idx" ON "case_team_memberships" ("team_id", "organization_membership_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "case_queues" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "team_id" uuid REFERENCES "case_teams"("id") ON DELETE SET NULL,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "assignment_strategy" text DEFAULT 'manual' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_queues_organization_idx" ON "case_queues" ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "case_queues_org_slug_idx" ON "case_queues" ("organization_id", "slug");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "queue_assignment_cursors" (
  "queue_id" uuid PRIMARY KEY NOT NULL REFERENCES "case_queues"("id") ON DELETE CASCADE,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "cursor_value" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "queue_assignment_cursors_organization_idx" ON "queue_assignment_cursors" ("organization_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "case_routing_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "priority" integer DEFAULT 100 NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "definition" jsonb NOT NULL,
  "target_queue_id" uuid NOT NULL REFERENCES "case_queues"("id") ON DELETE RESTRICT,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_routing_rules_organization_idx" ON "case_routing_rules" ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_routing_rules_priority_idx" ON "case_routing_rules" ("organization_id", "priority");
--> statement-breakpoint

ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "assigned_queue_id" uuid REFERENCES "case_queues"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "assigned_membership_id" uuid REFERENCES "organization_memberships"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "assigned_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "escalation_level" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "escalated_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "escalation_reason" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cases_queue_idx" ON "cases" ("organization_id", "assigned_queue_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cases_assignee_idx" ON "cases" ("organization_id", "assigned_membership_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "case_assignment_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "case_id" uuid NOT NULL REFERENCES "cases"("id") ON DELETE CASCADE,
  "from_queue_id" uuid REFERENCES "case_queues"("id") ON DELETE SET NULL,
  "to_queue_id" uuid REFERENCES "case_queues"("id") ON DELETE SET NULL,
  "from_membership_id" uuid REFERENCES "organization_memberships"("id") ON DELETE SET NULL,
  "to_membership_id" uuid REFERENCES "organization_memberships"("id") ON DELETE SET NULL,
  "source" text NOT NULL,
  "routing_rule_id" uuid REFERENCES "case_routing_rules"("id") ON DELETE SET NULL,
  "actor_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "reason" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_assignment_history_organization_idx" ON "case_assignment_history" ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_assignment_history_case_idx" ON "case_assignment_history" ("case_id", "created_at");
