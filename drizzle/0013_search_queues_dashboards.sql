CREATE TABLE IF NOT EXISTS "case_saved_views" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "owner_membership_id" uuid NOT NULL REFERENCES "organization_memberships"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "definition" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "is_default" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "case_saved_views_name_not_blank"
    CHECK (length(btrim("name")) > 0),
  CONSTRAINT "case_saved_views_definition_object"
    CHECK (jsonb_typeof("definition") = 'object')
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_saved_views_owner_idx"
  ON "case_saved_views" ("organization_id", "owner_membership_id", "name");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "case_saved_views_owner_name_idx"
  ON "case_saved_views" ("organization_id", "owner_membership_id", "name");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "case_saved_views_one_default_idx"
  ON "case_saved_views" ("organization_id", "owner_membership_id")
  WHERE "is_default" = true;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cases_organization_updated_idx"
  ON "cases" ("organization_id", "updated_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cases_open_assignee_idx"
  ON "cases" ("organization_id", "assigned_membership_id", "updated_at" DESC)
  WHERE "closed_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cases_open_queue_idx"
  ON "cases" ("organization_id", "assigned_queue_id", "updated_at" DESC)
  WHERE "closed_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_tags_operational_search_idx"
  ON "case_tags" ("organization_id", "tag", "case_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cases_full_text_search_idx"
  ON "cases"
  USING gin (
    to_tsvector(
      'simple',
      concat_ws(
        ' ',
        "case_number",
        "title",
        coalesce("summary", ''),
        "case_type"
      )
    )
  );
