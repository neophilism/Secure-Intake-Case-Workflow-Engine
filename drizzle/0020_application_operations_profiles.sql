ALTER TABLE "application_profiles"
  ADD COLUMN IF NOT EXISTS "operational_views" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "application_profiles"
  ADD COLUMN IF NOT EXISTS "operational_metrics" jsonb DEFAULT '[]'::jsonb NOT NULL;
