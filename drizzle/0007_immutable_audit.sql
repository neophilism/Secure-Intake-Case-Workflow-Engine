CREATE TABLE IF NOT EXISTS "audit_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  "actor_type" text NOT NULL,
  "actor_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "action" text NOT NULL,
  "resource_type" text NOT NULL,
  "resource_id" text NOT NULL,
  "parent_resource_type" text,
  "parent_resource_id" text,
  "correlation_id" uuid NOT NULL,
  "source" text DEFAULT 'application' NOT NULL,
  "previous_state" jsonb,
  "new_state" jsonb,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_organization_time_idx"
  ON "audit_events" ("organization_id", "occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_resource_idx"
  ON "audit_events" ("organization_id", "resource_type", "resource_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_actor_idx"
  ON "audit_events" ("organization_id", "actor_user_id", "occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_correlation_idx"
  ON "audit_events" ("organization_id", "correlation_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_action_idx"
  ON "audit_events" ("organization_id", "action", "occurred_at");
--> statement-breakpoint

CREATE OR REPLACE FUNCTION reject_audit_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS audit_events_immutable ON "audit_events";
--> statement-breakpoint
CREATE TRIGGER audit_events_immutable
BEFORE UPDATE OR DELETE ON "audit_events"
FOR EACH ROW
EXECUTE FUNCTION reject_audit_event_mutation();
