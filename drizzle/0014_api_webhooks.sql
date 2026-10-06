CREATE TABLE IF NOT EXISTS "api_clients" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "key_prefix" text NOT NULL,
  "key_hash" text NOT NULL,
  "permissions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" text NOT NULL DEFAULT 'active',
  "rate_limit_per_minute" integer NOT NULL DEFAULT 120,
  "rate_window_started_at" timestamp with time zone,
  "rate_window_count" integer NOT NULL DEFAULT 0,
  "expires_at" timestamp with time zone,
  "last_used_at" timestamp with time zone,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "api_clients_name_not_blank" CHECK (length(btrim("name")) > 0),
  CONSTRAINT "api_clients_status_check" CHECK ("status" IN ('active','revoked')),
  CONSTRAINT "api_clients_permissions_array" CHECK (jsonb_typeof("permissions") = 'array'),
  CONSTRAINT "api_clients_rate_limit_check"
    CHECK ("rate_limit_per_minute" BETWEEN 1 AND 10000),
  CONSTRAINT "api_clients_rate_window_count_check"
    CHECK ("rate_window_count" >= 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_clients_organization_idx"
  ON "api_clients" ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "api_clients_key_prefix_idx"
  ON "api_clients" ("key_prefix");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "api_clients_key_hash_idx"
  ON "api_clients" ("key_hash");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "webhook_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "endpoint_url" text NOT NULL,
  "event_types" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "signing_secret_ciphertext" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "disabled_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "webhook_subscriptions_name_not_blank"
    CHECK (length(btrim("name")) > 0),
  CONSTRAINT "webhook_subscriptions_status_check"
    CHECK ("status" IN ('active','disabled')),
  CONSTRAINT "webhook_subscriptions_event_types_array"
    CHECK (jsonb_typeof("event_types") = 'array')
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_subscriptions_organization_idx"
  ON "webhook_subscriptions" ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "webhook_subscriptions_org_name_idx"
  ON "webhook_subscriptions" ("organization_id", "name");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "subscription_id" uuid NOT NULL REFERENCES "webhook_subscriptions"("id") ON DELETE CASCADE,
  "audit_event_id" uuid NOT NULL REFERENCES "audit_events"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'pending',
  "attempt_count" integer NOT NULL DEFAULT 0,
  "response_status" integer,
  "last_error" text,
  "delivered_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "webhook_deliveries_status_check"
    CHECK ("status" IN ('pending','delivering','delivered','failed')),
  CONSTRAINT "webhook_deliveries_attempt_count_check"
    CHECK ("attempt_count" >= 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_deliveries_status_idx"
  ON "webhook_deliveries" ("organization_id", "status", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_deliveries_subscription_idx"
  ON "webhook_deliveries" ("subscription_id", "created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "webhook_deliveries_event_subscription_idx"
  ON "webhook_deliveries" ("subscription_id", "audit_event_id");
--> statement-breakpoint

CREATE OR REPLACE FUNCTION fanout_audit_event_webhooks()
RETURNS trigger AS $$
BEGIN
  IF NEW.action LIKE 'webhook.delivery.%' THEN
    RETURN NEW;
  END IF;

  WITH created AS (
    INSERT INTO "webhook_deliveries" (
      "organization_id",
      "subscription_id",
      "audit_event_id"
    )
    SELECT
      NEW.organization_id,
      subscription.id,
      NEW.id
    FROM "webhook_subscriptions" AS subscription
    WHERE subscription.organization_id = NEW.organization_id
      AND subscription.status = 'active'
      AND (
        subscription.event_types ? NEW.action
        OR subscription.event_types ? '*'
      )
    ON CONFLICT DO NOTHING
    RETURNING "id", "organization_id"
  )
  INSERT INTO "background_jobs" (
    "organization_id",
    "job_type",
    "payload",
    "priority",
    "dedupe_key",
    "max_attempts"
  )
  SELECT
    created.organization_id,
    'webhook.deliver',
    jsonb_build_object('deliveryId', created.id),
    40,
    'webhook:' || created.id::text,
    8
  FROM created
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS audit_events_webhook_fanout ON "audit_events";
--> statement-breakpoint
CREATE TRIGGER audit_events_webhook_fanout
AFTER INSERT ON "audit_events"
FOR EACH ROW
EXECUTE FUNCTION fanout_audit_event_webhooks();
