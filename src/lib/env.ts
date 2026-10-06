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
});

export const env = schema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  APP_BASE_URL: process.env.APP_BASE_URL,
  AUTH_SESSION_COOKIE_NAME: process.env.AUTH_SESSION_COOKIE_NAME,
  AUTH_SESSION_TTL_HOURS: process.env.AUTH_SESSION_TTL_HOURS,
});
