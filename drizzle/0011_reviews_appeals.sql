CREATE TABLE IF NOT EXISTS "review_policies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "key" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "level" integer DEFAULT 1 NOT NULL,
  "eligible_case_statuses" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "filing_window_value" integer,
  "filing_window_unit" text,
  "decision_deadline_value" integer,
  "decision_deadline_unit" text,
  "decision_warning_before_value" integer,
  "decision_warning_before_unit" text,
  "calendar_id" uuid REFERENCES "deadline_calendars"("id") ON DELETE RESTRICT,
  "allowed_outcomes" jsonb DEFAULT '["affirmed","modified","reversed","remanded","dismissed"]'::jsonb NOT NULL,
  "require_independent_reviewer" boolean DEFAULT true NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_policies_organization_idx"
  ON "review_policies" ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "review_policies_org_key_idx"
  ON "review_policies" ("organization_id", "key");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "review_policy_prerequisites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "policy_id" uuid NOT NULL REFERENCES "review_policies"("id") ON DELETE CASCADE,
  "prerequisite_policy_id" uuid NOT NULL REFERENCES "review_policies"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_policy_prerequisites_organization_idx"
  ON "review_policy_prerequisites" ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "review_policy_prerequisites_unique_idx"
  ON "review_policy_prerequisites" ("policy_id", "prerequisite_policy_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "case_reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "case_id" uuid NOT NULL REFERENCES "cases"("id") ON DELETE CASCADE,
  "policy_id" uuid NOT NULL REFERENCES "review_policies"("id") ON DELETE RESTRICT,
  "parent_review_id" uuid,
  "policy_key_snapshot" text NOT NULL,
  "policy_name_snapshot" text NOT NULL,
  "level_snapshot" integer NOT NULL,
  "policy_snapshot" jsonb NOT NULL,
  "challenged_snapshot" jsonb NOT NULL,
  "status" text DEFAULT 'filed' NOT NULL,
  "grounds" text NOT NULL,
  "requested_relief" text,
  "filed_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "filed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "filing_deadline_at" timestamp with time zone,
  "reviewer_membership_id" uuid REFERENCES "organization_memberships"("id") ON DELETE SET NULL,
  "assigned_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "assigned_at" timestamp with time zone,
  "started_at" timestamp with time zone,
  "decision_due_at" timestamp with time zone,
  "decision_warning_at" timestamp with time zone,
  "decision_warning_issued_at" timestamp with time zone,
  "decision_overdue_at" timestamp with time zone,
  "outcome" text,
  "written_decision" text,
  "remand_instructions" text,
  "decided_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamp with time zone,
  "withdrawn_at" timestamp with time zone,
  "case_effect_applied_at" timestamp with time zone,
  "case_effect_target_status" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "case_reviews_parent_review_fk"
    FOREIGN KEY ("parent_review_id")
    REFERENCES "case_reviews"("id")
    ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_reviews_organization_idx"
  ON "case_reviews" ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_reviews_case_idx"
  ON "case_reviews" ("case_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_reviews_status_idx"
  ON "case_reviews" ("organization_id", "status", "decision_due_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_reviews_reviewer_idx"
  ON "case_reviews" ("organization_id", "reviewer_membership_id", "status");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "case_review_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "review_id" uuid NOT NULL REFERENCES "case_reviews"("id") ON DELETE CASCADE,
  "event_type" text NOT NULL,
  "from_status" text,
  "to_status" text,
  "actor_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_review_history_organization_idx"
  ON "case_review_history" ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_review_history_review_idx"
  ON "case_review_history" ("review_id", "occurred_at");
