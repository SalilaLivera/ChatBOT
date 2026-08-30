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

  LANGUAGE_POLICY: z.enum(['face_only', 'reject', 'translate', 'singlish_llm']).default('face_only'),

  // ✅ SIGNED by the project owner, 2026-08-30 — C5's ratio bounds (C5_PLAN.md
  // §2 / BACKEND_IMPLEMENTATION_PLAN.md §5.4). Values unchanged from the
  // proposal (LOW=0.1, HIGH=0.6). The `.default()`s below are a DEVELOPMENT
  // convenience only — a real deployment must still set
  // LANGUAGE_BOUNDS_PROVENANCE explicitly; see the O-16 production guard in
  // `loadEnv()` below, which mirrors the §8.2 fusion-readiness pattern
  // (`src/readiness/fusionReadiness.ts`) and refuses to boot in production if
  // the provenance is still the unsigned placeholder.
  LANGUAGE_SI_RATIO_HIGH: z.coerce.number().min(0).max(1).default(0.6),
  LANGUAGE_SI_RATIO_LOW: z.coerce.number().min(0).max(1).default(0.1),
  LANGUAGE_BOUNDS_PROVENANCE: z.string().min(1).default('UNSIGNED PLACEHOLDER — see LANGUAGE_BOUNDS_PROPOSAL.md'),

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

  // ⛔ O-16 — mirrors the §8.2 fusion-readiness guard
  // (`src/readiness/fusionReadiness.ts`): in production, an UNSIGNED
  // provenance value must refuse to boot, not merely warn. Development and
  // test are unaffected — the zod `.default()`s above still let those run
  // without a signed provenance.
  if (parsed.data.NODE_ENV === 'production' && parsed.data.LANGUAGE_BOUNDS_PROVENANCE.includes('UNSIGNED')) {
    // eslint-disable-next-line no-console -- logger is not constructed yet at boot time
    console.error(
      'LANGUAGE_BOUNDS_PROVENANCE is UNSIGNED in production — refusing to start (O-16). ' +
        'The C5 ratio bounds must carry a signed provenance before this system runs in ' +
        'production; see LANGUAGE_BOUNDS_PROPOSAL.md.',
    );
    process.exit(1);
  }

  return parsed.data;
}

export const env: Env = loadEnv();
