CREATE TABLE IF NOT EXISTS "deadline_calendars" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "key" text NOT NULL,
  "name" text NOT NULL,
  "time_zone" text DEFAULT 'UTC' NOT NULL,
  "weekend_days" jsonb DEFAULT '[0,6]'::jsonb NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deadline_calendars_organization_idx"
  ON "deadline_calendars" ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "deadline_calendars_org_key_idx"
  ON "deadline_calendars" ("organization_id", "key");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "deadline_calendar_exclusions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "calendar_id" uuid NOT NULL REFERENCES "deadline_calendars"("id") ON DELETE CASCADE,
  "local_date" text NOT NULL,
  "label" text,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deadline_calendar_exclusions_calendar_idx"
  ON "deadline_calendar_exclusions" ("calendar_id", "local_date");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "deadline_calendar_exclusions_unique_idx"
  ON "deadline_calendar_exclusions" ("calendar_id", "local_date");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "case_deadlines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "case_id" uuid NOT NULL REFERENCES "cases"("id") ON DELETE CASCADE,
  "policy_key" text NOT NULL,
  "occurrence" integer DEFAULT 1 NOT NULL,
  "label" text NOT NULL,
  "description" text,
  "trigger_type" text NOT NULL,
  "trigger_key" text,
  "duration_value" integer NOT NULL,
  "duration_unit" text NOT NULL,
  "calendar_id" uuid REFERENCES "deadline_calendars"("id") ON DELETE RESTRICT,
  "warning_before_value" integer,
  "warning_before_unit" text,
  "pausable" boolean DEFAULT false NOT NULL,
  "escalation_priority" text,
  "escalation_queue_slug" text,
  "policy_snapshot" jsonb NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "started_at" timestamp with time zone NOT NULL,
  "due_at" timestamp with time zone NOT NULL,
  "warning_at" timestamp with time zone,
  "warning_issued_at" timestamp with time zone,
  "paused_at" timestamp with time zone,
  "accumulated_pause_seconds" integer DEFAULT 0 NOT NULL,
  "overdue_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "escalated_at" timestamp with time zone,
  "escalation_attempts" integer DEFAULT 0 NOT NULL,
  "last_escalation_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_deadlines_organization_idx"
  ON "case_deadlines" ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_deadlines_case_idx"
  ON "case_deadlines" ("case_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_deadlines_due_idx"
  ON "case_deadlines" ("organization_id", "status", "due_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "case_deadlines_occurrence_idx"
  ON "case_deadlines" ("case_id", "policy_key", "occurrence");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "case_deadline_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "deadline_id" uuid NOT NULL REFERENCES "case_deadlines"("id") ON DELETE CASCADE,
  "event_type" text NOT NULL,
  "actor_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "reason" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_deadline_history_deadline_idx"
  ON "case_deadline_history" ("deadline_id", "occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_deadline_history_organization_idx"
  ON "case_deadline_history" ("organization_id");
