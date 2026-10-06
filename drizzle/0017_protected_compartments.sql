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
    CHECK ("ciphertext" LIKE 'v1.%')
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
