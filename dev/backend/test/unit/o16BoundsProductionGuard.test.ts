import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertNotOom } from './helpers/spawnOomGuard.js';

const BACKEND_ROOT = join(__dirname, '..', '..');

// Modest, scoped heap ceiling (O-22): see bootFailsFast.test.ts for why.
const CHILD_NODE_OPTIONS = '--max-old-space-size=192';

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
    NODE_OPTIONS: CHILD_NODE_OPTIONS,
  };
}

const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';

/** Ask the OS for a free ephemeral port (O-19) — no hardcoded port to leak/collide on. */
function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address();
      if (address === null || typeof address === 'string') {
        srv.close();
        reject(new Error('could not determine a free port'));
        return;
      }
      const { port } = address;
      srv.close(() => resolve(port));
    });
  });
}

describe('O-16 — production boot refuses an UNSIGNED language bounds provenance', () => {
  it('production + UNSIGNED provenance → refuses to start', async () => {
    const port = await getFreePort();
    const result = spawnSync(npxBin, ['tsx', 'src/main.ts'], {
      cwd: BACKEND_ROOT,
      env: baseEnv('UNSIGNED PLACEHOLDER — see LANGUAGE_BOUNDS_PROPOSAL.md', 'production', String(port)),
      encoding: 'utf8',
      timeout: 20_000,
      shell: process.platform === 'win32',
      windowsVerbatimArguments: false,
    });

    assertNotOom(result.stdout, result.stderr);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/O-16/);
    expect(result.stderr).toMatch(/UNSIGNED/);
  }, 25_000);

  it('production + signed provenance → starts and logs "server listening"', async () => {
    const port = await getFreePort();
    const child = spawn(npxBin, ['tsx', 'src/main.ts'], {
      cwd: BACKEND_ROOT,
      env: baseEnv(
        'SIGNED by the project owner, 2026-08-30 — judgement not measurement; mixed is pending the ML track\'s ratio-sweep diagnostic',
        'production',
        String(port),
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

    try {
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
    } finally {
      // O-19: always reap the child — a leaked listener poisons the next run,
      // even when this test's own assertions never ran (early exit, timeout).
      if (child.exitCode === null && child.signalCode === null) {
        await new Promise<void>((resolve) => {
          child.once('exit', () => resolve());
          child.kill('SIGKILL');
        });
      }
    }

    assertNotOom(stdout, stderr);
    expect(stdout).toMatch(/server listening/);
    expect(stderr).not.toMatch(/O-16/);
  }, 25_000);
});
