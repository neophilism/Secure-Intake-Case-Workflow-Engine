CREATE TABLE IF NOT EXISTS "application_manifest_revisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "manifest_key" text NOT NULL,
  "manifest_hash" text NOT NULL,
  "manifest" jsonb NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "applied_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "applied_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "application_manifest_revisions_key_not_blank"
    CHECK (length(btrim("manifest_key")) > 0),
  CONSTRAINT "application_manifest_revisions_hash_check"
    CHECK ("manifest_hash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "application_manifest_revisions_manifest_object"
    CHECK (jsonb_typeof("manifest") = 'object'),
  CONSTRAINT "application_manifest_revisions_status_check"
    CHECK ("status" IN ('active','superseded'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "application_manifest_revisions_organization_idx"
  ON "application_manifest_revisions" ("organization_id", "applied_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "application_manifest_revisions_org_hash_idx"
  ON "application_manifest_revisions" ("organization_id", "manifest_hash");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "application_manifest_revisions_one_active_idx"
  ON "application_manifest_revisions" ("organization_id")
  WHERE "status" = 'active';
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "application_profiles" (
  "organization_id" uuid PRIMARY KEY REFERENCES "organizations"("id") ON DELETE CASCADE,
  "manifest_revision_id" uuid NOT NULL REFERENCES "application_manifest_revisions"("id") ON DELETE RESTRICT,
  "application_key" text NOT NULL,
  "application_name" text NOT NULL,
  "short_name" text,
  "description" text,
  "branding" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "terminology" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "application_profiles_key_not_blank"
    CHECK (length(btrim("application_key")) > 0),
  CONSTRAINT "application_profiles_name_not_blank"
    CHECK (length(btrim("application_name")) > 0),
  CONSTRAINT "application_profiles_branding_object"
    CHECK (jsonb_typeof("branding") = 'object'),
  CONSTRAINT "application_profiles_terminology_object"
    CHECK (jsonb_typeof("terminology") = 'object')
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "application_profiles_org_key_idx"
  ON "application_profiles" ("organization_id", "application_key");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "application_managed_resources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "manifest_revision_id" uuid NOT NULL REFERENCES "application_manifest_revisions"("id") ON DELETE CASCADE,
  "resource_type" text NOT NULL,
  "resource_key" text NOT NULL,
  "resource_id" text NOT NULL,
  "checksum" text NOT NULL,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "application_managed_resources_type_not_blank"
    CHECK (length(btrim("resource_type")) > 0),
  CONSTRAINT "application_managed_resources_key_not_blank"
    CHECK (length(btrim("resource_key")) > 0),
  CONSTRAINT "application_managed_resources_id_not_blank"
    CHECK (length(btrim("resource_id")) > 0),
  CONSTRAINT "application_managed_resources_checksum_check"
    CHECK ("checksum" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "application_managed_resources_key_idx"
  ON "application_managed_resources"
  ("organization_id", "resource_type", "resource_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "application_managed_resources_revision_idx"
  ON "application_managed_resources" ("manifest_revision_id");
