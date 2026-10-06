CREATE TABLE IF NOT EXISTS "auth_login_throttles" (
  "key_hash" text PRIMARY KEY NOT NULL,
  "window_started_at" timestamp with time zone NOT NULL,
  "failure_count" integer NOT NULL DEFAULT 0,
  "blocked_until" timestamp with time zone,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "auth_login_throttles_hash_check"
    CHECK ("key_hash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "auth_login_throttles_failure_count_check"
    CHECK ("failure_count" >= 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_login_throttles_blocked_until_idx"
  ON "auth_login_throttles" ("blocked_until");
