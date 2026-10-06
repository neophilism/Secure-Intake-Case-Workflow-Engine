CREATE TABLE IF NOT EXISTS "case_number_sequences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "calendar_year" integer NOT NULL,
  "last_value" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "case_number_sequences_org_year_idx"
  ON "case_number_sequences" ("organization_id", "calendar_year");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "cases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "case_number" text NOT NULL,
  "source_submission_id" uuid REFERENCES "intake_submissions"("id") ON DELETE RESTRICT,
  "case_type" text DEFAULT 'general' NOT NULL,
  "title" text NOT NULL,
  "summary" text,
  "status" text DEFAULT 'intake_review' NOT NULL,
  "priority" text DEFAULT 'normal' NOT NULL,
  "disposition" text,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "opened_at" timestamp with time zone,
  "resolved_at" timestamp with time zone,
  "closed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cases_organization_idx" ON "cases" ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cases_status_idx" ON "cases" ("organization_id", "status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cases_org_number_idx" ON "cases" ("organization_id", "case_number");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cases_source_submission_idx" ON "cases" ("source_submission_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "case_status_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "case_id" uuid NOT NULL REFERENCES "cases"("id") ON DELETE CASCADE,
  "from_status" text,
  "to_status" text NOT NULL,
  "actor_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_status_history_organization_idx" ON "case_status_history" ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_status_history_case_idx" ON "case_status_history" ("case_id", "created_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "case_tags" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "case_id" uuid NOT NULL REFERENCES "cases"("id") ON DELETE CASCADE,
  "tag" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_tags_organization_idx" ON "case_tags" ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "case_tags_case_tag_idx" ON "case_tags" ("case_id", "tag");
