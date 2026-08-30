// Tiny fixture spawned by readiness.test.ts (D-42) to observe the resolved
// DEPLOYMENT_POSTURE value from a real boot of src/config/env.ts, without
// pulling in vitest's own module cache.
import { env } from '../../../src/config/env.js';

console.log(JSON.stringify({ posture: env.DEPLOYMENT_POSTURE }));
