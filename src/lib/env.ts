import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z
    .string()
    .url()
    .or(z.string().startsWith("postgres://"))
    .optional(),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  AUTH_SESSION_COOKIE_NAME: z.string().min(1).default("sicwe_session"),
  AUTH_SESSION_TTL_HOURS: z.coerce.number().int().positive().default(12),
  BACKGROUND_JOB_LEASE_SECONDS: z.coerce.number().int().positive().default(60),
  BACKGROUND_JOB_POLL_MS: z.coerce.number().int().positive().default(1000),
  BACKGROUND_JOB_BATCH_SIZE: z.coerce.number().int().positive().max(100).default(10),
  BACKGROUND_DEADLINE_SWEEP_SECONDS: z.coerce.number().int().positive().default(60),
  API_DEFAULT_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().max(10000).default(120),
  WEBHOOK_ENCRYPTION_KEY: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
});

export const env = schema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  APP_BASE_URL: process.env.APP_BASE_URL,
  AUTH_SESSION_COOKIE_NAME: process.env.AUTH_SESSION_COOKIE_NAME,
  AUTH_SESSION_TTL_HOURS: process.env.AUTH_SESSION_TTL_HOURS,
  BACKGROUND_JOB_LEASE_SECONDS: process.env.BACKGROUND_JOB_LEASE_SECONDS,
  BACKGROUND_JOB_POLL_MS: process.env.BACKGROUND_JOB_POLL_MS,
  BACKGROUND_JOB_BATCH_SIZE: process.env.BACKGROUND_JOB_BATCH_SIZE,
  BACKGROUND_DEADLINE_SWEEP_SECONDS:
    process.env.BACKGROUND_DEADLINE_SWEEP_SECONDS,
  API_DEFAULT_RATE_LIMIT_PER_MINUTE:
    process.env.API_DEFAULT_RATE_LIMIT_PER_MINUTE,
  WEBHOOK_ENCRYPTION_KEY:
    process.env.WEBHOOK_ENCRYPTION_KEY || undefined,
});
