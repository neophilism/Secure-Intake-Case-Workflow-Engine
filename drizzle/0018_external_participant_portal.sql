CREATE TABLE IF NOT EXISTS "external_participant_credentials" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "submission_id" uuid NOT NULL REFERENCES "intake_submissions"("id") ON DELETE CASCADE,
  "secret_hash" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "credential_version" integer NOT NULL DEFAULT 1,
  "last_authenticated_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "external_participant_credentials_secret_hash_check"
    CHECK ("secret_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "external_participant_credentials_status_check"
    CHECK ("status" IN ('active','revoked')),
  CONSTRAINT "external_participant_credentials_version_check"
    CHECK ("credential_version" > 0),
  CONSTRAINT "external_participant_credentials_revoked_check"
    CHECK (
      ("status" = 'active' AND "revoked_at" IS NULL)
      OR
      ("status" = 'revoked' AND "revoked_at" IS NOT NULL)
    )
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "external_participant_credentials_submission_idx"
  ON "external_participant_credentials" ("submission_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "external_participant_credentials_secret_hash_idx"
  ON "external_participant_credentials" ("secret_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "external_participant_credentials_org_idx"
  ON "external_participant_credentials" ("organization_id", "status");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "external_participant_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "credential_id" uuid NOT NULL REFERENCES "external_participant_credentials"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "last_seen_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "external_participant_sessions_token_hash_check"
    CHECK ("token_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "external_participant_sessions_token_hash_idx"
  ON "external_participant_sessions" ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "external_participant_sessions_credential_idx"
  ON "external_participant_sessions" ("credential_id", "expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "external_participant_sessions_org_idx"
  ON "external_participant_sessions" ("organization_id", "expires_at");
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "enforce_external_participant_credential_tenant"()
RETURNS trigger
LANGUAGE plpgsql
AS $participant_credential_tenant$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "intake_submissions" s
    WHERE s."id" = NEW."submission_id"
      AND s."organization_id" = NEW."organization_id"
  ) THEN
    RAISE EXCEPTION 'External participant credential organization must match its submission.';
  END IF;
  RETURN NEW;
END;
$participant_credential_tenant$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "external_participant_credentials_tenant_trigger"
  ON "external_participant_credentials";
--> statement-breakpoint
CREATE TRIGGER "external_participant_credentials_tenant_trigger"
BEFORE INSERT OR UPDATE
ON "external_participant_credentials"
FOR EACH ROW
EXECUTE FUNCTION "enforce_external_participant_credential_tenant"();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "enforce_external_participant_session_tenant"()
RETURNS trigger
LANGUAGE plpgsql
AS $participant_session_tenant$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "external_participant_credentials" c
    WHERE c."id" = NEW."credential_id"
      AND c."organization_id" = NEW."organization_id"
  ) THEN
    RAISE EXCEPTION 'External participant session organization must match its credential.';
  END IF;
  RETURN NEW;
END;
$participant_session_tenant$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "external_participant_sessions_tenant_trigger"
  ON "external_participant_sessions";
--> statement-breakpoint
CREATE TRIGGER "external_participant_sessions_tenant_trigger"
BEFORE INSERT OR UPDATE
ON "external_participant_sessions"
FOR EACH ROW
EXECUTE FUNCTION "enforce_external_participant_session_tenant"();
