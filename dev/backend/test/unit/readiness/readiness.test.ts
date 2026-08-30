/**
 * ★ C7 Part D (D-32) — the full multi-upstream `/ready` handshake. Fake
 * clients only (no live containers needed for the LOGIC; the live-stack
 * case is exercised by the integration suite / manual verification against
 * the real three-container stack).
 *
 * ★ Follow-up packet 3, step 4 (D-42) — `nodeEnv` was replaced by `posture`
 * (DEPLOYMENT_POSTURE) throughout this file. This is the intended semantic
 * change: readiness gating no longer keys off NODE_ENV at all. The two cases
 * that previously used `nodeEnv: 'production'` / `'development'` are renamed
 * to `posture: 'strict'` / `'research_demo'` — same coverage, same assertions,
 * new field. No existing assertion is weakened or removed.
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkReadiness, type ReadinessDeps } from '../../../src/readiness/readiness.js';
import { assertNotOom } from '../helpers/spawnOomGuard.js';

const BACKEND_ROOT = join(__dirname, '..', '..', '..');

function baseDeps(overrides: Partial<ReadinessDeps> = {}): ReadinessDeps {
  return {
    ferClient: { verifyContract: async () => ({ ok: true }) },
    sentimentClient: { verifyContract: async () => ({ ok: true }) },
    fusionClient: {
      verifyContract: async () => ({ ok: true }),
      health: async () => ({
        ok: true,
        data: { status: 'ok', fusion_version: 'fusion-v1', parameters_provenance: 'x', parameters_are_placeholder: false },
      }),
    },
    posture: 'strict',
    ...overrides,
  };
}

describe('checkReadiness — all three upstreams, plus the §8.2 placeholder guard', () => {
  it('ready: true when all three upstreams verify and fusion is not placeholder-gated', async () => {
    const result = await checkReadiness(baseDeps());
    expect(result.ready).toBe(true);
    expect(result.checks.fer.ready).toBe(true);
    expect(result.checks.sentiment.ready).toBe(true);
    expect(result.checks.fusion.ready).toBe(true);
    expect(result.checks.fer.artifactIdentity).toBeTruthy();
    expect(result.checks.sentiment.artifactIdentity).toBeTruthy();
    expect(result.checks.fusion.artifactIdentity).toBeTruthy();
  });

  it('ready: false when FER contract verification fails, others unaffected', async () => {
    const result = await checkReadiness(
      baseDeps({ ferClient: { verifyContract: async () => ({ ok: false, reason: 'model_version mismatch' }) } }),
    );
    expect(result.ready).toBe(false);
    expect(result.checks.fer.ready).toBe(false);
    expect(result.checks.fer.reason).toMatch(/model_version/);
    expect(result.checks.sentiment.ready).toBe(true);
  });

  it('ready: false when sentiment contract verification fails', async () => {
    const result = await checkReadiness(
      baseDeps({ sentimentClient: { verifyContract: async () => ({ ok: false, reason: 'label_space mismatch' }) } }),
    );
    expect(result.ready).toBe(false);
    expect(result.checks.sentiment.ready).toBe(false);
  });

  it('⛔ §8.2 guard 2 — strict posture + placeholder fusion parameters → not ready, even though the contract itself matches', async () => {
    const result = await checkReadiness(
      baseDeps({
        posture: 'strict',
        fusionClient: {
          verifyContract: async () => ({ ok: true }),
          health: async () => ({
            ok: true,
            data: { status: 'ok', fusion_version: 'fusion-v1', parameters_provenance: 'PLACEHOLDER FOR TESTING', parameters_are_placeholder: true },
          }),
        },
      }),
    );
    expect(result.ready).toBe(false);
    expect(result.checks.fusion.ready).toBe(false);
    expect(result.checks.fusion.reason).toMatch(/PLACEHOLDER|placeholder/);
  });

  it('research_demo posture + placeholder fusion parameters → still ready (guard 2 is strict-only), and reports the placeholder flag', async () => {
    const result = await checkReadiness(
      baseDeps({
        posture: 'research_demo',
        fusionClient: {
          verifyContract: async () => ({ ok: true }),
          health: async () => ({
            ok: true,
            data: { status: 'ok', fusion_version: 'fusion-v1', parameters_provenance: 'PLACEHOLDER FOR TESTING', parameters_are_placeholder: true },
          }),
        },
      }),
    );
    expect(result.ready).toBe(true);
    expect(result.parametersArePlaceholder).toBe(true);
  });

  it('⛔ research_demo posture + a broken upstream (fusion contract mismatch) → still not ready — posture excuses placeholder parameters, never a broken dependency', async () => {
    const result = await checkReadiness(
      baseDeps({
        posture: 'research_demo',
        fusionClient: {
          verifyContract: async () => ({ ok: false, reason: 'fusion_version mismatch' }),
          health: async () => ({
            ok: true,
            data: { status: 'ok', fusion_version: 'fusion-v1', parameters_provenance: 'PLACEHOLDER FOR TESTING', parameters_are_placeholder: true },
          }),
        },
      }),
    );
    expect(result.ready).toBe(false);
    expect(result.checks.fusion.ready).toBe(false);
  });

  it('⛔ research_demo posture + fusion unreachable (health check fails outright) → still not ready', async () => {
    const result = await checkReadiness(
      baseDeps({
        posture: 'research_demo',
        fusionClient: {
          verifyContract: async () => ({ ok: true }),
          health: async () => ({ ok: false, reason: 'ECONNREFUSED' }),
        },
      }),
    );
    expect(result.ready).toBe(false);
    expect(result.checks.fusion.ready).toBe(false);
  });
});

describe('DEPLOYMENT_POSTURE — env boundary (D-42)', () => {
  it('unset DEPLOYMENT_POSTURE behaves as `strict` — fails closed', () => {
    const rest = { ...process.env };
    delete rest.DEPLOYMENT_POSTURE;
    const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const script = join(__dirname, 'printPosture.mjs');
    const result = spawnSync(npxBin, ['tsx', script], {
      cwd: BACKEND_ROOT,
      env: {
        ...rest,
        FER_SERVICE_URL: 'http://fer:7860',
        SENTIMENT_SERVICE_URL: 'http://sentiment:8000',
        FUSION_SERVICE_URL: 'http://fusion:9000',
        DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
        JWT_SECRET: 'test-secret',
        NODE_OPTIONS: '--max-old-space-size=192',
      },
      encoding: 'utf8',
      timeout: 15_000,
      shell: process.platform === 'win32',
      windowsVerbatimArguments: false,
    });

    assertNotOom(result.stdout, result.stderr);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/"posture":"strict"/);
  });

  it('an invalid DEPLOYMENT_POSTURE value fails boot — never silently coerced to strict', () => {
    const rest = { ...process.env };
    const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const result = spawnSync(npxBin, ['tsx', 'src/main.ts'], {
      cwd: BACKEND_ROOT,
      env: {
        ...rest,
        PORT: '3998',
        FER_SERVICE_URL: 'http://fer:7860',
        SENTIMENT_SERVICE_URL: 'http://sentiment:8000',
        FUSION_SERVICE_URL: 'http://fusion:9000',
        DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
        JWT_SECRET: 'test-secret',
        DEPLOYMENT_POSTURE: 'yolo',
        NODE_OPTIONS: '--max-old-space-size=192',
      },
      encoding: 'utf8',
      timeout: 15_000,
      shell: process.platform === 'win32',
      windowsVerbatimArguments: false,
    });

    assertNotOom(result.stdout, result.stderr);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/DEPLOYMENT_POSTURE/);
  });
});
