CREATE TABLE IF NOT EXISTS "intake_forms" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "access_mode" text DEFAULT 'public' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "intake_forms_organization_idx" ON "intake_forms" ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "intake_forms_org_slug_idx" ON "intake_forms" ("organization_id", "slug");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "intake_form_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "form_id" uuid NOT NULL REFERENCES "intake_forms"("id") ON DELETE CASCADE,
  "version_number" integer NOT NULL,
  "definition" jsonb NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "intake_form_versions_organization_idx" ON "intake_form_versions" ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "intake_form_versions_form_idx" ON "intake_form_versions" ("form_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "intake_form_versions_form_number_idx" ON "intake_form_versions" ("form_id", "version_number");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "intake_submissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "form_id" uuid NOT NULL REFERENCES "intake_forms"("id") ON DELETE RESTRICT,
  "form_version_id" uuid NOT NULL REFERENCES "intake_form_versions"("id") ON DELETE RESTRICT,
  "submitter_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "draft_token_hash" text,
  "confirmation_code" text,
  "submitted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "intake_submissions_organization_idx" ON "intake_submissions" ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "intake_submissions_form_idx" ON "intake_submissions" ("form_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "intake_submissions_draft_token_hash_idx" ON "intake_submissions" ("draft_token_hash");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "intake_submissions_confirmation_code_idx" ON "intake_submissions" ("confirmation_code");
