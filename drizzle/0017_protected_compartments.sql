CREATE TABLE IF NOT EXISTS "submission_protected_compartments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "submission_id" uuid NOT NULL REFERENCES "intake_submissions"("id") ON DELETE CASCADE,
  "compartment_key" text NOT NULL,
  "ciphertext" text NOT NULL,
  "field_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "submission_protected_compartments_key_check"
    CHECK ("compartment_key" ~ '^[a-z][a-z0-9_-]{0,99}$'),
  CONSTRAINT "submission_protected_compartments_ciphertext_check"
    CHECK ("ciphertext" LIKE 'v1.%'),
  CONSTRAINT "submission_protected_compartments_field_ids_check"
    CHECK (jsonb_typeof("field_ids") = 'array')
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "submission_protected_compartments_org_idx"
  ON "submission_protected_compartments" ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "submission_protected_compartments_submission_idx"
  ON "submission_protected_compartments" ("submission_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "submission_protected_compartments_unique_idx"
  ON "submission_protected_compartments" ("submission_id", "compartment_key");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "protected_reveal_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "compartment_id" uuid NOT NULL REFERENCES "submission_protected_compartments"("id") ON DELETE CASCADE,
  "requested_by_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "reason" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "decided_by_user_id" uuid REFERENCES "users"("id") ON DELETE RESTRICT,
  "decision_reason" text,
  "decided_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "protected_reveal_requests_status_check"
    CHECK ("status" IN ('pending','approved','rejected','consumed')),
  CONSTRAINT "protected_reveal_requests_reason_check"
    CHECK (length(btrim("reason")) BETWEEN 1 AND 5000),
  CONSTRAINT "protected_reveal_requests_four_eyes_check"
    CHECK ("decided_by_user_id" IS NULL OR "decided_by_user_id" <> "requested_by_user_id"),
  CONSTRAINT "protected_reveal_requests_approved_fields_check"
    CHECK (
      ("status" = 'pending' AND "decided_by_user_id" IS NULL AND "decided_at" IS NULL AND "expires_at" IS NULL AND "consumed_at" IS NULL)
      OR
      ("status" = 'rejected' AND "decided_by_user_id" IS NOT NULL AND "decided_at" IS NOT NULL AND "expires_at" IS NULL AND "consumed_at" IS NULL)
      OR
      ("status" = 'approved' AND "decided_by_user_id" IS NOT NULL AND "decided_at" IS NOT NULL AND "expires_at" IS NOT NULL AND "consumed_at" IS NULL)
      OR
      ("status" = 'consumed' AND "decided_by_user_id" IS NOT NULL AND "decided_at" IS NOT NULL AND "expires_at" IS NOT NULL AND "consumed_at" IS NOT NULL)
    )
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "protected_reveal_requests_org_idx"
  ON "protected_reveal_requests" ("organization_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "protected_reveal_requests_compartment_idx"
  ON "protected_reveal_requests" ("compartment_id", "created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "protected_reveal_requests_active_idx"
  ON "protected_reveal_requests" ("compartment_id", "requested_by_user_id")
  WHERE "status" IN ('pending','approved');
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "enforce_submission_protected_compartment_tenant"()
RETURNS trigger
LANGUAGE plpgsql
AS $protected_compartment_tenant$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "intake_submissions" s
    WHERE s."id" = NEW."submission_id"
      AND s."organization_id" = NEW."organization_id"
  ) THEN
    RAISE EXCEPTION 'Protected compartment organization must match its submission.';
  END IF;
  RETURN NEW;
END;
$protected_compartment_tenant$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "submission_protected_compartments_tenant_trigger"
  ON "submission_protected_compartments";
--> statement-breakpoint
CREATE TRIGGER "submission_protected_compartments_tenant_trigger"
BEFORE INSERT OR UPDATE
ON "submission_protected_compartments"
FOR EACH ROW
EXECUTE FUNCTION "enforce_submission_protected_compartment_tenant"();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "enforce_protected_reveal_request_tenant"()
RETURNS trigger
LANGUAGE plpgsql
AS $protected_reveal_tenant$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "submission_protected_compartments" c
    WHERE c."id" = NEW."compartment_id"
      AND c."organization_id" = NEW."organization_id"
  ) THEN
    RAISE EXCEPTION 'Protected reveal request organization must match its compartment.';
  END IF;
  RETURN NEW;
END;
$protected_reveal_tenant$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "protected_reveal_requests_tenant_trigger"
  ON "protected_reveal_requests";
--> statement-breakpoint
CREATE TRIGGER "protected_reveal_requests_tenant_trigger"
BEFORE INSERT OR UPDATE
ON "protected_reveal_requests"
FOR EACH ROW
EXECUTE FUNCTION "enforce_protected_reveal_request_tenant"();
