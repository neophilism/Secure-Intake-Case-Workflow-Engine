UPDATE "case_notes"
SET "visibility" = 'participant'
WHERE "visibility" = 'case_participants';
--> statement-breakpoint
UPDATE "communication_templates"
SET "default_visibility" = 'participant'
WHERE "default_visibility" = 'case_participants';
--> statement-breakpoint
UPDATE "case_correspondence_messages"
SET "visibility" = 'participant'
WHERE "visibility" = 'case_participants';
--> statement-breakpoint
ALTER TABLE "communication_templates"
  ALTER COLUMN "default_visibility" SET DEFAULT 'participant';
--> statement-breakpoint
ALTER TABLE "case_correspondence_messages"
  ALTER COLUMN "visibility" SET DEFAULT 'participant';
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "disclosure_publications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "source_type" text NOT NULL,
  "source_id" uuid NOT NULL,
  "slug" text NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "withdrawn_at" timestamp with time zone,
  "withdrawn_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "withdrawal_reason" text,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "disclosure_publications_source_type_check"
    CHECK ("source_type" IN ('case','submission','document','note','correspondence','review')),
  CONSTRAINT "disclosure_publications_status_check"
    CHECK ("status" IN ('draft','published','withdrawn'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "disclosure_publications_organization_idx"
  ON "disclosure_publications" ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "disclosure_publications_org_slug_idx"
  ON "disclosure_publications" ("organization_id", "slug");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "disclosure_publications_source_idx"
  ON "disclosure_publications" ("organization_id", "source_type", "source_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "disclosure_publication_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "publication_id" uuid NOT NULL REFERENCES "disclosure_publications"("id") ON DELETE CASCADE,
  "version_number" integer NOT NULL,
  "public_title" text NOT NULL,
  "public_summary" text,
  "public_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "redaction_summary" text,
  "status" text DEFAULT 'draft' NOT NULL,
  "prepared_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "submitted_at" timestamp with time zone,
  "reviewed_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "review_note" text,
  "approved_at" timestamp with time zone,
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "disclosure_publication_versions_status_check"
    CHECK ("status" IN ('draft','submitted','approved','rejected','published','superseded')),
  CONSTRAINT "disclosure_publication_versions_four_eyes_check"
    CHECK (
      "reviewed_by_user_id" IS NULL
      OR "prepared_by_user_id" IS NULL
      OR "reviewed_by_user_id" <> "prepared_by_user_id"
    )
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "disclosure_publication_versions_org_idx"
  ON "disclosure_publication_versions" ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "disclosure_publication_versions_status_idx"
  ON "disclosure_publication_versions" ("organization_id", "status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "disclosure_publication_versions_number_idx"
  ON "disclosure_publication_versions" ("publication_id", "version_number");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "disclosure_publication_versions_published_idx"
  ON "disclosure_publication_versions" ("publication_id")
  WHERE "status" = 'published';
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "document_derivatives" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "source_document_version_id" uuid NOT NULL REFERENCES "document_versions"("id") ON DELETE RESTRICT,
  "derivative_document_version_id" uuid NOT NULL REFERENCES "document_versions"("id") ON DELETE RESTRICT,
  "audience" text NOT NULL,
  "redaction_summary" text,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "document_derivatives_audience_check"
    CHECK ("audience" IN ('public','participant')),
  CONSTRAINT "document_derivatives_distinct_versions_check"
    CHECK ("source_document_version_id" <> "derivative_document_version_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_derivatives_source_idx"
  ON "document_derivatives" ("organization_id", "source_document_version_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "document_derivatives_derived_idx"
  ON "document_derivatives" ("derivative_document_version_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "disclosure_publication_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "publication_version_id" uuid NOT NULL REFERENCES "disclosure_publication_versions"("id") ON DELETE CASCADE,
  "document_derivative_id" uuid NOT NULL REFERENCES "document_derivatives"("id") ON DELETE RESTRICT,
  "label" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "attached_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "attached_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "disclosure_publication_documents_org_idx"
  ON "disclosure_publication_documents" ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "disclosure_publication_documents_version_idx"
  ON "disclosure_publication_documents" ("publication_version_id", "sort_order");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "disclosure_publication_documents_unique_idx"
  ON "disclosure_publication_documents" ("publication_version_id", "document_derivative_id");
--> statement-breakpoint

CREATE OR REPLACE FUNCTION preserve_disclosure_publication_version_content()
RETURNS trigger AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.publication_id IS DISTINCT FROM OLD.publication_id
    OR NEW.version_number IS DISTINCT FROM OLD.version_number
    OR NEW.public_title IS DISTINCT FROM OLD.public_title
    OR NEW.public_summary IS DISTINCT FROM OLD.public_summary
    OR NEW.public_data IS DISTINCT FROM OLD.public_data
    OR NEW.redaction_summary IS DISTINCT FROM OLD.redaction_summary
    OR NEW.prepared_by_user_id IS DISTINCT FROM OLD.prepared_by_user_id
  THEN
    RAISE EXCEPTION 'Disclosure publication version content is immutable; create a revision instead';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS disclosure_publication_versions_preserve_content
  ON "disclosure_publication_versions";
--> statement-breakpoint
CREATE TRIGGER disclosure_publication_versions_preserve_content
BEFORE UPDATE ON "disclosure_publication_versions"
FOR EACH ROW
EXECUTE FUNCTION preserve_disclosure_publication_version_content();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION validate_document_derivative_provenance()
RETURNS trigger AS $$
DECLARE
  source_org uuid;
  derivative_org uuid;
  derivative_visibility text;
BEGIN
  SELECT "organization_id"
    INTO source_org
    FROM "document_versions"
    WHERE "id" = NEW.source_document_version_id;

  SELECT dv."organization_id", d."visibility"
    INTO derivative_org, derivative_visibility
    FROM "document_versions" dv
    JOIN "documents" d
      ON d."id" = dv."document_id"
      AND d."organization_id" = dv."organization_id"
    WHERE dv."id" = NEW.derivative_document_version_id;

  IF source_org IS NULL OR derivative_org IS NULL
    OR source_org <> NEW.organization_id
    OR derivative_org <> NEW.organization_id
  THEN
    RAISE EXCEPTION 'Derivative source and output must belong to the same organization';
  END IF;

  IF derivative_visibility <> NEW.audience THEN
    RAISE EXCEPTION 'Derivative document visibility must match derivative audience';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS document_derivatives_validate_provenance
  ON "document_derivatives";
--> statement-breakpoint
CREATE TRIGGER document_derivatives_validate_provenance
BEFORE INSERT OR UPDATE ON "document_derivatives"
FOR EACH ROW
EXECUTE FUNCTION validate_document_derivative_provenance();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION validate_public_disclosure_document_link()
RETURNS trigger AS $$
DECLARE
  derivative_org uuid;
  derivative_audience text;
  target_org uuid;
  target_status text;
  target_version_id uuid;
  target_derivative_id uuid;
  target_link_org uuid;
BEGIN
  target_version_id :=
    CASE WHEN TG_OP = 'DELETE'
      THEN OLD.publication_version_id
      ELSE NEW.publication_version_id
    END;
  target_derivative_id :=
    CASE WHEN TG_OP = 'DELETE'
      THEN OLD.document_derivative_id
      ELSE NEW.document_derivative_id
    END;
  target_link_org :=
    CASE WHEN TG_OP = 'DELETE'
      THEN OLD.organization_id
      ELSE NEW.organization_id
    END;

  SELECT "organization_id", "status"
    INTO target_org, target_status
    FROM "disclosure_publication_versions"
    WHERE "id" = target_version_id;

  IF target_org IS NULL
    OR target_org <> target_link_org
    OR target_status <> 'draft'
  THEN
    RAISE EXCEPTION 'Disclosure documents may only be changed while the version is a same-tenant draft';
  END IF;

  IF TG_OP <> 'DELETE' THEN
    SELECT "organization_id", "audience"
      INTO derivative_org, derivative_audience
      FROM "document_derivatives"
      WHERE "id" = target_derivative_id;

    IF derivative_org IS NULL
      OR derivative_org <> target_link_org
    THEN
      RAISE EXCEPTION 'Disclosure document link must remain within one organization';
    END IF;

    IF derivative_audience <> 'public' THEN
      RAISE EXCEPTION 'Public disclosure may only link public document derivatives';
    END IF;

    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS disclosure_publication_documents_validate_link
  ON "disclosure_publication_documents";
--> statement-breakpoint
CREATE TRIGGER disclosure_publication_documents_validate_link
BEFORE INSERT OR UPDATE OR DELETE ON "disclosure_publication_documents"
FOR EACH ROW
EXECUTE FUNCTION validate_public_disclosure_document_link();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION preserve_disclosure_publication_identity()
RETURNS trigger AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.source_type IS DISTINCT FROM OLD.source_type
    OR NEW.source_id IS DISTINCT FROM OLD.source_id
    OR NEW.slug IS DISTINCT FROM OLD.slug
    OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Disclosure publication identity and public slug are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS disclosure_publications_preserve_identity
  ON "disclosure_publications";
--> statement-breakpoint
CREATE TRIGGER disclosure_publications_preserve_identity
BEFORE UPDATE ON "disclosure_publications"
FOR EACH ROW
EXECUTE FUNCTION preserve_disclosure_publication_identity();

--> statement-breakpoint
CREATE OR REPLACE FUNCTION preserve_document_derivative_provenance()
RETURNS trigger AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.source_document_version_id IS DISTINCT FROM OLD.source_document_version_id
    OR NEW.derivative_document_version_id IS DISTINCT FROM OLD.derivative_document_version_id
    OR NEW.audience IS DISTINCT FROM OLD.audience
    OR NEW.redaction_summary IS DISTINCT FROM OLD.redaction_summary
    OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Document derivative provenance is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS document_derivatives_preserve_provenance
  ON "document_derivatives";
--> statement-breakpoint
CREATE TRIGGER document_derivatives_preserve_provenance
BEFORE UPDATE ON "document_derivatives"
FOR EACH ROW
EXECUTE FUNCTION preserve_document_derivative_provenance();
