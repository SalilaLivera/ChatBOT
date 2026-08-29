# MaternaLink backend — Phase C1 (Foundation)

TypeScript + Express service. C1 scope: it talks to nothing — no FER, sentiment,
or fusion client, no mood logic. See `docs/backend build/plan/C1_PLAN.md` and
`docs/plan/backend/BACKEND_BUILD_PHASES.md` § Phase C1.

## Development

```bash
npm install
npm run dev        # tsx watch
npm run build       # tsc -> dist/
npm run lint
npm test
```

## Environment

All configuration is read once, in `src/config/env.ts`, and validated with
`zod` at boot. A missing required variable fails startup immediately with the
variable named — never lazily at request time. See `.env.example` at the repo
root.

## Module boundaries (§2.1)

- `src/config/` is the only place `process.env` is read — enforced by ESLint
  (`no-restricted-properties`) and a test (`test/unit/envBoundary.test.ts`).
- `src/logging/logger.ts` applies redaction at the logger, not at call sites.
  Message text is never logged at any level.
