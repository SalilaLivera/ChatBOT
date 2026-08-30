import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const BACKEND_ROOT = join(__dirname, '..', '..');

function baseEnv(provenance: string, nodeEnv: string, port: string): NodeJS.ProcessEnv {
  const rest = { ...process.env };
  delete rest.LANGUAGE_BOUNDS_PROVENANCE;
  return {
    ...rest,
    PORT: port,
    NODE_ENV: nodeEnv,
    FER_SERVICE_URL: 'http://fer:7860',
    SENTIMENT_SERVICE_URL: 'http://sentiment:8000',
    FUSION_SERVICE_URL: 'http://fusion:9000',
    DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
    JWT_SECRET: 'test-secret',
    LANGUAGE_BOUNDS_PROVENANCE: provenance,
  };
}

const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';

describe('O-16 — production boot refuses an UNSIGNED language bounds provenance', () => {
  it('production + UNSIGNED provenance → refuses to start', () => {
    const result = spawnSync(npxBin, ['tsx', 'src/main.ts'], {
      cwd: BACKEND_ROOT,
      env: baseEnv('UNSIGNED PLACEHOLDER — see LANGUAGE_BOUNDS_PROPOSAL.md', 'production', '3998'),
      encoding: 'utf8',
      timeout: 20_000,
      shell: process.platform === 'win32',
      windowsVerbatimArguments: false,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/O-16/);
    expect(result.stderr).toMatch(/UNSIGNED/);
  }, 25_000);

  it('production + signed provenance → starts and logs "server listening"', async () => {
    const child = spawn(npxBin, ['tsx', 'src/main.ts'], {
      cwd: BACKEND_ROOT,
      env: baseEnv(
        'SIGNED by the project owner, 2026-08-30 — judgement not measurement; mixed is pending the ML track\'s ratio-sweep diagnostic',
        'production',
        '3997',
      ),
      shell: process.platform === 'win32',
      windowsVerbatimArguments: false,
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`timed out waiting for "server listening". stdout=${stdout} stderr=${stderr}`));
      }, 20_000);
      const check = setInterval(() => {
        if (stdout.includes('server listening')) {
          clearInterval(check);
          clearTimeout(timer);
          resolve();
        }
      }, 100);
      child.on('exit', (code) => {
        // an early, unexpected exit (e.g. the O-16 guard firing) fails fast
        if (!stdout.includes('server listening')) {
          clearInterval(check);
          clearTimeout(timer);
          reject(new Error(`process exited early with code ${code}. stdout=${stdout} stderr=${stderr}`));
        }
      });
    });

    child.kill('SIGKILL');

    expect(stdout).toMatch(/server listening/);
    expect(stderr).not.toMatch(/O-16/);
  }, 25_000);
});
