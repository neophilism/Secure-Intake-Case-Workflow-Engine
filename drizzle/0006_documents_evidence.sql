CREATE TABLE IF NOT EXISTS "document_types" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "key" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "status" text DEFAULT 'active' NOT NULL,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_types_organization_idx" ON "document_types" ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "document_types_org_key_idx" ON "document_types" ("organization_id", "key");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "document_type_id" uuid NOT NULL REFERENCES "document_types"("id") ON DELETE RESTRICT,
  "title" text NOT NULL,
  "description" text,
  "visibility" text DEFAULT 'internal' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_organization_idx" ON "documents" ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_type_idx" ON "documents" ("organization_id", "document_type_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "document_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "document_id" uuid NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
  "version_number" integer NOT NULL,
  "original_filename" text NOT NULL,
  "mime_type" text NOT NULL,
  "size_bytes" integer NOT NULL,
  "sha256" text NOT NULL,
  "storage_driver" text NOT NULL,
  "storage_key" text NOT NULL,
  "content_status" text DEFAULT 'quarantined' NOT NULL,
  "malware_scan_status" text DEFAULT 'pending' NOT NULL,
  "malware_scan_provider" text,
  "malware_scan_details" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "malware_scanned_at" timestamp with time zone,
  "uploaded_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_versions_organization_idx" ON "document_versions" ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_versions_document_idx" ON "document_versions" ("document_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "document_versions_document_number_idx" ON "document_versions" ("document_id", "version_number");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "document_versions_storage_idx" ON "document_versions" ("storage_driver", "storage_key");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "document_case_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "case_id" uuid NOT NULL REFERENCES "cases"("id") ON DELETE CASCADE,
  "document_version_id" uuid NOT NULL REFERENCES "document_versions"("id") ON DELETE RESTRICT,
  "relationship" text DEFAULT 'evidence' NOT NULL,
  "evidence_description" text,
  "source_description" text,
  "exhibit_label" text,
  "attached_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "attached_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_case_links_organization_idx" ON "document_case_links" ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_case_links_case_idx" ON "document_case_links" ("case_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "document_case_links_case_version_idx" ON "document_case_links" ("case_id", "document_version_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "document_submission_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "submission_id" uuid NOT NULL REFERENCES "intake_submissions"("id") ON DELETE CASCADE,
  "document_version_id" uuid NOT NULL REFERENCES "document_versions"("id") ON DELETE RESTRICT,
  "form_field_id" text,
  "attached_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "attached_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_submission_links_organization_idx" ON "document_submission_links" ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_submission_links_submission_idx" ON "document_submission_links" ("submission_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "document_submission_links_submission_version_idx" ON "document_submission_links" ("submission_id", "document_version_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "document_custody_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "document_version_id" uuid NOT NULL REFERENCES "document_versions"("id") ON DELETE CASCADE,
  "action" text NOT NULL,
  "from_custodian" text,
  "to_custodian" text,
  "location" text,
  "note" text,
  "actor_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_custody_events_organization_idx" ON "document_custody_events" ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_custody_events_version_idx" ON "document_custody_events" ("document_version_id", "occurred_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "document_access_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "document_version_id" uuid NOT NULL REFERENCES "document_versions"("id") ON DELETE CASCADE,
  "action" text NOT NULL,
  "actor_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_access_events_organization_idx" ON "document_access_events" ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_access_events_version_idx" ON "document_access_events" ("document_version_id", "created_at");
