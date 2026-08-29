import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, afterEach } from 'vitest';
import { scanForParameterAssignment } from '../../../scripts/fusionParamGuard.mjs';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..');
const BACKEND_SRC = join(REPO_ROOT, 'dev', 'backend', 'src');
const BACKEND_SCRIPTS = join(REPO_ROOT, 'dev', 'backend', 'scripts');
const FUSION_SERVICE = join(REPO_ROOT, 'dev', 'fusion-service');

let scratchDir: string | undefined;

afterEach(() => {
  if (scratchDir) {
    rmSync(scratchDir, { recursive: true, force: true });
    scratchDir = undefined;
  }
});

describe('O-7 — the fusion parameter guard distinguishes assignment from mention', () => {
  it('the committed tree (src/, scripts/, dev/fusion-service/) has zero violations', () => {
    const violations = scanForParameterAssignment([BACKEND_SRC, BACKEND_SCRIPTS, FUSION_SERVICE]);
    expect(violations).toEqual([]);
  });

  it('⛔ a planted `W_face = 0.5` assignment is CAUGHT — proving the guard can fail, not just pass', () => {
    scratchDir = mkdtempSync(join(tmpdir(), 'o7-guard-plant-'));
    writeFileSync(
      join(scratchDir, 'planted.ts'),
      '// deliberately planted O-7 violation\nexport const W_face = 0.5;\n',
    );

    const violations = scanForParameterAssignment([scratchDir]);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]!.symbol).toBe('W_face');

    // Remove it and re-scan the SAME directory — the guard returns to clean,
    // proving the failure above was real and not a permanently-broken guard.
    rmSync(join(scratchDir, 'planted.ts'));
    const afterRemoval = scanForParameterAssignment([scratchDir]);
    expect(afterRemoval).toEqual([]);
  });

  it('⛔ a planted `"tau_distress": 0.6` dict-literal assignment is also caught', () => {
    scratchDir = mkdtempSync(join(tmpdir(), 'o7-guard-plant-'));
    writeFileSync(join(scratchDir, 'planted.py'), 'config = {"tau_distress": 0.6}\n');

    const violations = scanForParameterAssignment([scratchDir]);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]!.symbol).toBe('tau_distress');
  });

  it('a file that only NAMES the symbols in prose / env-var keys is NOT flagged', () => {
    scratchDir = mkdtempSync(join(tmpdir(), 'o7-guard-plant-'));
    writeFileSync(
      join(scratchDir, 'prose.ts'),
      [
        '// This file only names W_face and tau_distress in prose, explaining',
        '// why face scores must not be one-hot whenever the face weight',
        '// dominates the fusion sum. FUSION_W_FACE and FUSION_TAU_DISTRESS are',
        '// read from the environment — no literal value is assigned to either',
        '// symbol anywhere in this file.',
        'export function readFusionEnv(env: Record<string, string | undefined>) {',
        '  return { face: env.FUSION_W_FACE, distress: env.FUSION_TAU_DISTRESS };',
        '}',
        '',
      ].join('\n'),
    );

    const violations = scanForParameterAssignment([scratchDir]);
    expect(violations).toEqual([]);
  });
});
