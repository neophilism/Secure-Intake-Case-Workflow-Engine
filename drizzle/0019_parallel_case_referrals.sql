CREATE TABLE IF NOT EXISTS "case_referral_policies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "key" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "definition" jsonb NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_referral_policies_organization_idx"
  ON "case_referral_policies" ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "case_referral_policies_org_key_idx"
  ON "case_referral_policies" ("organization_id", "key");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "case_referrals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "case_id" uuid NOT NULL REFERENCES "cases"("id") ON DELETE CASCADE,
  "policy_id" uuid NOT NULL REFERENCES "case_referral_policies"("id") ON DELETE RESTRICT,
  "policy_key" text NOT NULL,
  "policy_snapshot" jsonb NOT NULL,
  "recipient_key" text,
  "recipient_name" text NOT NULL,
  "external_reference" text,
  "subject" text,
  "summary" text,
  "status" text DEFAULT 'draft' NOT NULL,
  "sent_at" timestamp with time zone,
  "acknowledged_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_referrals_organization_idx"
  ON "case_referrals" ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_referrals_case_idx"
  ON "case_referrals" ("case_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_referrals_status_idx"
  ON "case_referrals" ("organization_id", "status", "updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_referrals_recipient_idx"
  ON "case_referrals" ("organization_id", "recipient_key");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "case_referral_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "referral_id" uuid NOT NULL REFERENCES "case_referrals"("id") ON DELETE CASCADE,
  "event_type" text NOT NULL,
  "summary" text,
  "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "actor_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_referral_events_organization_idx"
  ON "case_referral_events" ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_referral_events_referral_idx"
  ON "case_referral_events" ("referral_id", "occurred_at");
--> statement-breakpoint

ALTER TABLE "case_deadlines"
  ADD COLUMN IF NOT EXISTS "referral_id" uuid REFERENCES "case_referrals"("id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_deadlines_referral_idx"
  ON "case_deadlines" ("referral_id");
--> statement-breakpoint
DROP INDEX IF EXISTS "case_deadlines_occurrence_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "case_deadlines_case_occurrence_idx"
  ON "case_deadlines" ("case_id", "policy_key", "occurrence")
  WHERE "referral_id" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "case_deadlines_referral_occurrence_idx"
  ON "case_deadlines" ("referral_id", "policy_key", "occurrence")
  WHERE "referral_id" IS NOT NULL;
