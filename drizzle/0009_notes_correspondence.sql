CREATE TABLE IF NOT EXISTS "case_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "case_id" uuid NOT NULL REFERENCES "cases"("id") ON DELETE CASCADE,
  "visibility" text DEFAULT 'internal' NOT NULL,
  "body" text NOT NULL,
  "author_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_notes_organization_idx"
  ON "case_notes" ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_notes_case_idx"
  ON "case_notes" ("case_id", "created_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "case_note_document_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "note_id" uuid NOT NULL REFERENCES "case_notes"("id") ON DELETE CASCADE,
  "document_version_id" uuid NOT NULL REFERENCES "document_versions"("id") ON DELETE RESTRICT,
  "attached_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "attached_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_note_document_links_organization_idx"
  ON "case_note_document_links" ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_note_document_links_note_idx"
  ON "case_note_document_links" ("note_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "case_note_document_links_unique_idx"
  ON "case_note_document_links" ("note_id", "document_version_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "communication_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "key" text NOT NULL,
  "name" text NOT NULL,
  "channel" text DEFAULT 'email' NOT NULL,
  "subject_template" text,
  "body_template" text NOT NULL,
  "default_visibility" text DEFAULT 'case_participants' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "communication_templates_organization_idx"
  ON "communication_templates" ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "communication_templates_org_key_idx"
  ON "communication_templates" ("organization_id", "key");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "case_communication_threads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "case_id" uuid NOT NULL REFERENCES "cases"("id") ON DELETE CASCADE,
  "subject" text,
  "status" text DEFAULT 'open' NOT NULL,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_communication_threads_organization_idx"
  ON "case_communication_threads" ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_communication_threads_case_idx"
  ON "case_communication_threads" ("case_id", "updated_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "case_correspondence_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "case_id" uuid NOT NULL REFERENCES "cases"("id") ON DELETE CASCADE,
  "thread_id" uuid NOT NULL REFERENCES "case_communication_threads"("id") ON DELETE CASCADE,
  "direction" text NOT NULL,
  "channel" text DEFAULT 'email' NOT NULL,
  "visibility" text DEFAULT 'case_participants' NOT NULL,
  "status" text NOT NULL,
  "subject" text,
  "body" text NOT NULL,
  "sender_address" text,
  "recipients" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "external_message_id" text,
  "in_reply_to_message_id" uuid,
  "template_id" uuid REFERENCES "communication_templates"("id") ON DELETE SET NULL,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "queued_at" timestamp with time zone,
  "sent_at" timestamp with time zone,
  "received_at" timestamp with time zone,
  "delivery_provider" text,
  "delivery_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "failure_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_correspondence_messages_organization_idx"
  ON "case_correspondence_messages" ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_correspondence_messages_case_idx"
  ON "case_correspondence_messages" ("case_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_correspondence_messages_thread_idx"
  ON "case_correspondence_messages" ("thread_id", "created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "case_correspondence_messages_external_idx"
  ON "case_correspondence_messages" ("organization_id", "delivery_provider", "external_message_id")
  WHERE "external_message_id" IS NOT NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "correspondence_message_document_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "message_id" uuid NOT NULL REFERENCES "case_correspondence_messages"("id") ON DELETE CASCADE,
  "document_version_id" uuid NOT NULL REFERENCES "document_versions"("id") ON DELETE RESTRICT,
  "attached_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "attached_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "correspondence_message_document_links_organization_idx"
  ON "correspondence_message_document_links" ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "correspondence_message_document_links_message_idx"
  ON "correspondence_message_document_links" ("message_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "correspondence_message_document_links_unique_idx"
  ON "correspondence_message_document_links" ("message_id", "document_version_id");
