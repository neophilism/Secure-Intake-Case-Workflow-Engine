CREATE TABLE IF NOT EXISTS "notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "organization_membership_id" uuid NOT NULL REFERENCES "organization_memberships"("id") ON DELETE CASCADE,
  "event_type" text NOT NULL,
  "severity" text DEFAULT 'info' NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "link" text,
  "resource_type" text,
  "resource_id" text,
  "in_app_visible" boolean DEFAULT true NOT NULL,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_membership_time_idx"
  ON "notifications" ("organization_membership_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_organization_event_idx"
  ON "notifications" ("organization_id", "event_type", "created_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "notification_preferences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "organization_membership_id" uuid NOT NULL REFERENCES "organization_memberships"("id") ON DELETE CASCADE,
  "event_type" text DEFAULT '*' NOT NULL,
  "channel" text NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "destination" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_preferences_organization_idx"
  ON "notification_preferences" ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notification_preferences_membership_event_channel_idx"
  ON "notification_preferences" ("organization_membership_id", "event_type", "channel");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "notification_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "notification_id" uuid NOT NULL REFERENCES "notifications"("id") ON DELETE CASCADE,
  "channel" text NOT NULL,
  "destination" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "provider" text,
  "external_message_id" text,
  "attempts" integer DEFAULT 0 NOT NULL,
  "last_error" text,
  "delivered_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_deliveries_notification_idx"
  ON "notification_deliveries" ("notification_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_deliveries_status_idx"
  ON "notification_deliveries" ("organization_id", "status", "created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notification_deliveries_notification_channel_idx"
  ON "notification_deliveries" ("notification_id", "channel");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "background_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "job_type" text NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "priority" integer DEFAULT 100 NOT NULL,
  "dedupe_key" text,
  "available_at" timestamp with time zone DEFAULT now() NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer DEFAULT 5 NOT NULL,
  "locked_by" text,
  "locked_at" timestamp with time zone,
  "lease_until" timestamp with time zone,
  "last_error" text,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "background_jobs_ready_idx"
  ON "background_jobs" ("status", "available_at", "priority", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "background_jobs_lease_idx"
  ON "background_jobs" ("status", "lease_until");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "background_jobs_organization_idx"
  ON "background_jobs" ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "background_jobs_dedupe_idx"
  ON "background_jobs" ("organization_id", "job_type", "dedupe_key")
  WHERE "dedupe_key" IS NOT NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "background_job_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "job_id" uuid NOT NULL REFERENCES "background_jobs"("id") ON DELETE CASCADE,
  "attempt_number" integer NOT NULL,
  "worker_id" text NOT NULL,
  "outcome" text,
  "error_message" text,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "background_job_attempts_job_idx"
  ON "background_job_attempts" ("job_id", "attempt_number");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "background_job_attempts_number_idx"
  ON "background_job_attempts" ("job_id", "attempt_number");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "background_schedules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "key" text NOT NULL,
  "job_type" text NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "interval_seconds" integer NOT NULL,
  "priority" integer DEFAULT 100 NOT NULL,
  "max_attempts" integer DEFAULT 5 NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "next_run_at" timestamp with time zone NOT NULL,
  "last_enqueued_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "background_schedules_due_idx"
  ON "background_schedules" ("status", "next_run_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "background_schedules_org_key_idx"
  ON "background_schedules" ("organization_id", "key");
