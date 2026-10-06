CREATE TABLE IF NOT EXISTS "case_workflows" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "status" text DEFAULT 'active' NOT NULL,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_workflows_organization_idx" ON "case_workflows" ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "case_workflows_org_slug_idx" ON "case_workflows" ("organization_id", "slug");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "case_workflow_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "workflow_id" uuid NOT NULL REFERENCES "case_workflows"("id") ON DELETE CASCADE,
  "version_number" integer NOT NULL,
  "definition" jsonb NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_workflow_versions_organization_idx" ON "case_workflow_versions" ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_workflow_versions_workflow_idx" ON "case_workflow_versions" ("workflow_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "case_workflow_versions_workflow_number_idx" ON "case_workflow_versions" ("workflow_id", "version_number");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "case_workflow_versions_one_published_idx" ON "case_workflow_versions" ("workflow_id") WHERE "status" = 'published';
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "intake_form_workflow_bindings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "form_id" uuid NOT NULL REFERENCES "intake_forms"("id") ON DELETE CASCADE,
  "workflow_id" uuid NOT NULL REFERENCES "case_workflows"("id") ON DELETE RESTRICT,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "intake_form_workflow_bindings_organization_idx" ON "intake_form_workflow_bindings" ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "intake_form_workflow_bindings_form_idx" ON "intake_form_workflow_bindings" ("form_id");
--> statement-breakpoint

ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "workflow_version_id" uuid;
--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "workflow_definition" jsonb;
--> statement-breakpoint
UPDATE "cases"
SET "workflow_definition" = '{
  "schemaVersion":1,
  "initialState":"intake_review",
  "states":[
    {"key":"intake_review","label":"Intake review"},
    {"key":"accepted","label":"Accepted"},
    {"key":"rejected","label":"Rejected"},
    {"key":"open","label":"Open"},
    {"key":"resolved","label":"Resolved"},
    {"key":"closed","label":"Closed"}
  ],
  "transitions":[
    {"key":"accept_intake","label":"Accept intake","from":"intake_review","to":"accepted","requiredPermissions":["case:update"]},
    {"key":"reject_intake","label":"Reject intake","from":"intake_review","to":"rejected","requiredPermissions":["case:update"]},
    {"key":"open_accepted_case","label":"Open case","from":"accepted","to":"open","requiredPermissions":["case:update"],"actions":[{"type":"mark_open"}]},
    {"key":"return_accepted_to_intake","label":"Return to intake review","from":"accepted","to":"intake_review","requiredPermissions":["case:update"]},
    {"key":"reconsider_rejected_intake","label":"Reconsider","from":"rejected","to":"intake_review","requiredPermissions":["case:update"]},
    {"key":"resolve_open_case","label":"Resolve case","from":"open","to":"resolved","requiredPermissions":["case:update"],"actions":[{"type":"mark_resolved"}]},
    {"key":"close_open_case","label":"Close case","from":"open","to":"closed","requiredPermissions":["case:close"],"actions":[{"type":"mark_closed"}]},
    {"key":"reopen_resolved_case","label":"Reopen case","from":"resolved","to":"open","requiredPermissions":["case:update"],"actions":[{"type":"mark_open"}]},
    {"key":"close_resolved_case","label":"Close case","from":"resolved","to":"closed","requiredPermissions":["case:close"],"actions":[{"type":"mark_closed"}]},
    {"key":"reopen_closed_case","label":"Reopen case","from":"closed","to":"open","requiredPermissions":["case:update"],"actions":[{"type":"mark_open"}]}
  ]
}'::jsonb
WHERE "workflow_definition" IS NULL;
--> statement-breakpoint
ALTER TABLE "cases" ALTER COLUMN "workflow_definition" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "cases"
  ADD CONSTRAINT "cases_workflow_version_fk"
  FOREIGN KEY ("workflow_version_id")
  REFERENCES "case_workflow_versions"("id")
  ON DELETE RESTRICT;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cases_workflow_version_idx" ON "cases" ("workflow_version_id");
--> statement-breakpoint

ALTER TABLE "case_status_history" ADD COLUMN IF NOT EXISTS "workflow_version_id" uuid;
--> statement-breakpoint
ALTER TABLE "case_status_history" ADD COLUMN IF NOT EXISTS "transition_key" text;
--> statement-breakpoint
ALTER TABLE "case_status_history" ADD COLUMN IF NOT EXISTS "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "case_status_history"
  ADD CONSTRAINT "case_status_history_workflow_version_fk"
  FOREIGN KEY ("workflow_version_id")
  REFERENCES "case_workflow_versions"("id")
  ON DELETE RESTRICT;
