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

  // ---------------------------------------------------------------------
  // LLM (M7). ⛔ D-6 GATE — see src/llm/factory.ts.
  //
  // LLM_PROVIDER DEFAULTS TO 'mock' AND MUST REMAIN SO until D-6 (sending
  // pregnancy-domain user messages to a third-party US inference provider) is
  // explicitly resolved. Setting it to 'groq' additionally requires
  // GROQ_API_KEY and LLM_MODEL — neither has a default that reaches a network.
  //
  // GROQ_API_KEY is SERVER-SIDE ONLY. It is never returned in a response, never
  // logged, and /health has no field for it.
  // ---------------------------------------------------------------------
  LLM_PROVIDER: z.enum(['mock', 'groq']).default('mock'),
  GROQ_API_KEY: z.string().optional(),
  // Pinned explicitly: free-tier model IDs are deprecated with little notice,
  // and /health reports the active one so a silent swap is visible.
  LLM_MODEL: z.string().optional(),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
  LLM_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(800),
  // D-9 (conversation history, docs/integration/plan/D7_HISTORY_PLAN.md §3) —
  // number of prior USER/ASSISTANT PAIRS included in the LLM request. A
  // starting, unmeasured number, not a token-budget calculation — see the
  // plan for why a message-count window was chosen over a tokenizer.
  // 0 (min) means history is fetched but always empty, i.e. today's
  // single-turn behaviour; there is no separate on/off switch.
  LLM_HISTORY_TURNS: z.coerce.number().int().min(0).default(3),

  DATABASE_URL: z.string().min(1),
  // ★ C7 (revised twice) — Supabase authentication, VERIFICATION ONLY.
  //
  // The project's base URL, e.g. https://<ref>.supabase.co. Its JWKS endpoint
  // (`/auth/v1/.well-known/jwks.json`) supplies the ES256 PUBLIC keys used to
  // verify tokens Supabase issued. This backend is not a JWT issuer and owns
  // no password or refresh-token state; Supabase owns token lifecycle.
  //
  // ⛔ THERE IS NO SHARED SECRET, DELIBERATELY. The previous `JWT_SECRET`
  // (HS256) was Supabase's legacy scheme; current projects sign
  // asymmetrically and publish only public keys, so every real token was
  // rejected under the old code. Holding no signing material means this
  // backend can verify a token but is structurally incapable of minting one.
  //
  // Never defaulted. Missing configuration fails boot (bootFailsFast.test.ts)
  // rather than falling back to any shared or demo identity.
  SUPABASE_URL: z.string().url(),

  // ✅ OWNER-DECIDED, C7_DECISIONS_AND_GAPS.md §5.1 — PROVISIONAL ENGINEERING
  // LIMITS. NOT ML measurements, NOT calibrated values, NOT a production-
  // capacity claim. The face figure is the minimum that permits §3A.6's
  // specified 5 fps capture (300 frames/min/user) without throttling a
  // correct client. Concurrent-user capacity remains UNKNOWN — C8.4 owns it.
  // ⛔ No additional tiers.
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_FACE_PER_MIN: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_TEXT_PER_MIN: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_IP_PER_MIN: z.coerce.number().int().positive().default(600),

  // ✅ OWNER-DECIDED, C7_DECISIONS_AND_GAPS.md §5.3 — an engineering/project
  // retention decision, NOT a clinical or scientific claim. Historical
  // face-derived mood observations age out under this policy; they are NOT
  // retroactively deleted by consent revocation (prospective-only, §1).
  // ⛔ No additional retention categories.
  MOOD_OBSERVATION_RETENTION_DAYS: z.coerce.number().int().positive().default(30),

  // --- follow-up packet 3, step 3 — CORS ---
  // Explicit origin ALLOWLIST, comma-separated. ⛔ Never `*` — auth is a
  // bearer token, not a cookie, so `credentials: true` is never enabled
  // either (see src/server.ts). The two localhost origins are Expo web's
  // default ports and are safe to default on — a real deployment adds its
  // Vercel domain(s) on top via this same variable, it does not replace them.
  CORS_ALLOWED_ORIGINS: z.string().min(1).default('http://localhost:8081,http://localhost:8082'),

  // --- follow-up packet 3, step 4 (D-42) — /ready deployment posture ---
  // ⛔ GOVERNANCE. Deliberately separate from NODE_ENV, which stays a pure
  // Node runtime posture and continues to arm every other production guard
  // (O-16 included) unconditionally. `checkFusionReadiness` reads THIS
  // value, not NODE_ENV, to decide whether placeholder fusion parameters
  // block readiness. Defaults to `strict` — an unset variable fails closed,
  // preserving the original §8.2 behaviour exactly. Never named like a
  // bypass (e.g. ALLOW_PLACEHOLDER_PARAMETERS) — see C7_DECISIONS_AND_GAPS.md
  // D-42. An invalid value fails validation and boot refuses to start, the
  // same as any other malformed required value here — it is never silently
  // coerced to `strict`.
  DEPLOYMENT_POSTURE: z.enum(['strict', 'research_demo']).default('strict'),
});

export type Env = z.infer<typeof envSchema>;
export type DeploymentPosture = Env['DEPLOYMENT_POSTURE'];

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

  // ⛔ D-6 BOOT GUARD — same shape as the O-16 guard above and the §8.2
  // fusion-readiness guard (fusionReadiness.ts): a marking without
  // enforcement is how an unsigned/unapproved value reaches production
  // unnoticed. D-6 (D6_APPROVAL_SCOPED.md) approves Groq for ONE scope only —
  // real project-team test text, on a LOCAL DEVELOPMENT MACHINE.
  //
  // ⚠ Reads NODE_ENV, NOT DEPLOYMENT_POSTURE — deliberately, after an earlier
  // draft of this guard got it wrong. DEPLOYMENT_POSTURE tracks a DIFFERENT
  // axis (may placeholder-derived fusion results be shown) and defaults to
  // 'strict' EVERYWHERE, including a production deploy that simply forgot to
  // set `research_demo`. Reading DEPLOYMENT_POSTURE here would silently miss
  // exactly that case — a Railway box in production, default posture, with
  // LLM_PROVIDER=groq set by accident — which is precisely the leak D-6 was
  // written to prevent. `NODE_ENV === 'development'` is the one value in this
  // codebase that actually means "the local machine," which is what D-6's
  // scope is written in terms of.
  if (parsed.data.NODE_ENV !== 'development' && parsed.data.LLM_PROVIDER !== 'mock') {
    // eslint-disable-next-line no-console -- logger is not constructed yet at boot time
    console.error(
      `LLM_PROVIDER=${parsed.data.LLM_PROVIDER} under NODE_ENV=${parsed.data.NODE_ENV} — ` +
        'refusing to start (D-6). D-6 approves Groq for project-team test text on a local ' +
        "development machine ONLY (NODE_ENV=development); see docs/backend build/" +
        'D6_APPROVAL_SCOPED.md. Widening this scope is a new decision, not an extension of the ' +
        'existing approval.',
    );
    process.exit(1);
  }

  return parsed.data;
}

export const env: Env = loadEnv();
