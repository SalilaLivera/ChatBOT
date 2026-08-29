/**
 * The only file in src/ that reads process.env (§2.1 rule 4, grep-verified by CI).
 *
 * Validated with zod at import time — booting with a required variable absent
 * fails loudly here, before the server starts listening, not on first request.
 *
 * FER_TIMEOUT_MS / SENTIMENT_TIMEOUT_MS / FUSION_TIMEOUT_MS defaults below are
 * PROVISIONAL — FER end-to-end latency and all sentiment latency are UNKNOWN
 * (handoff §7.1, §13). They are set for real in C8.3. This is an estimate, not
 * a measurement, and is labelled as such here and nowhere else silently.
 */
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  FER_SERVICE_URL: z.string().url(),
  SENTIMENT_SERVICE_URL: z.string().url(),
  FUSION_SERVICE_URL: z.string().url(),

  // PROVISIONAL defaults — see file header. Not measured.
  FER_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
  SENTIMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  FUSION_TIMEOUT_MS: z.coerce.number().int().positive().default(1000),

  LANGUAGE_POLICY: z.enum(['face_only', 'reject', 'translate']).default('face_only'),

  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(1),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    // eslint-disable-next-line no-console -- logger is not constructed yet at boot time
    console.error(`Environment validation failed — refusing to start. ${missing}`);
    process.exit(1);
  }
  return parsed.data;
}

export const env: Env = loadEnv();
