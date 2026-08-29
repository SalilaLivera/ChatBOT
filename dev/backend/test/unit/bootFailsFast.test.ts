import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const BACKEND_ROOT = join(__dirname, '..', '..');

describe('boot with a required variable absent (§2.1, §9.6)', () => {
  it('fails fast, names the variable, and exits non-zero — not on first request', () => {
    const rest = { ...process.env };
    delete rest.JWT_SECRET;
    const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const result = spawnSync(npxBin, ['tsx', 'src/main.ts'], {
      cwd: BACKEND_ROOT,
      env: {
        ...rest,
        PORT: '3999',
        FER_SERVICE_URL: 'http://fer:7860',
        SENTIMENT_SERVICE_URL: 'http://sentiment:8000',
        FUSION_SERVICE_URL: 'http://fusion:9000',
        DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
        // JWT_SECRET deliberately absent
      },
      encoding: 'utf8',
      timeout: 15_000,
      shell: process.platform === 'win32',
      windowsVerbatimArguments: false,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/JWT_SECRET/);
  });
});
