import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Normalised to forward slashes — grep.exe (Git Bash / MSYS) on Windows does
// not reliably accept backslash-separated paths passed via execFileSync
// (no shell, so no path translation happens).
const toPosix = (p: string): string => p.replace(/\\/g, '/');
const REPO_ROOT = toPosix(join(__dirname, '..', '..', '..', '..', '..'));
const BACKEND_SRC = toPosix(join(__dirname, '..', '..', '..', 'src'));

/**
 * §4 / Part D — the class->state mapping table must appear EXACTLY ONCE in
 * the repository's production source. Targets the class->state ASSOCIATION
 * (a FER class name immediately paired with a state string), not the mere
 * presence of the words — so it does NOT false-positive on
 * dev/backend/src/clients/types.ts, which legitimately holds a flat ordering
 * constant (ruled permitted in C2, C2_DONE.md §3.1) naming the same strings
 * with no class->state pairing.
 */
// [ ]* rather than \s* deliberately — execFileSync spawns grep.exe directly
// on Windows (no shell), and its MSYS argv reconstruction from the raw
// command line mangles a literal backslash-s in a way that silently makes
// the pattern match nothing. A bracket class avoids the backslash entirely.
const MAPPING_ASSOCIATION_PATTERN =
  "(happy|angry|disgust|fear|sad|surprise)[ ]*:[ ]*'(calm|neutral|distressed)'";

function grepProductionSource(): string[] {
  // grep -rlP over the repo, excluding node_modules/dist/venvs/.git AND any
  // `test` directory — tests legitimately restate the mapping to assert
  // against it (T-A1, T-A6); the invariant is about production source.
  try {
    const out = execFileSync(
      'grep',
      [
        '-rlP',
        MAPPING_ASSOCIATION_PATTERN,
        '--include=*.ts',
        '--include=*.js',
        '--include=*.py',
        '--exclude-dir=node_modules',
        '--exclude-dir=dist',
        '--exclude-dir=.venv',
        '--exclude-dir=__pycache__',
        '--exclude-dir=.git',
        '--exclude-dir=test',
        REPO_ROOT,
      ],
      // O-23 — `grep -P` fails with "supports only unibyte and UTF-8 locales"
      // when LANG/LC_ALL are unset in the shell environment. Force a UTF-8
      // locale explicitly rather than relying on whatever the CI/local shell
      // happens to have. Fixed here after resurfacing (first flagged as D-24
      // in C3 and wrongly left as "environment-specific").
      { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C.UTF-8' } },
    );
    return out.split('\n').filter(Boolean);
  } catch (err) {
    // grep exit 1 = normal "no match" (empty stdout) — a legitimate pass.
    // Any other status (2 = usage/execution error, e.g. locale failure or a
    // missing grep binary) must NOT be swallowed as "no match": that would
    // let an inability to *run* grep masquerade as a satisfied invariant.
    const asExecError = err as { status?: number; stdout?: string; stderr?: string };
    if (asExecError.status === 1) return [];
    throw new Error(
      `grep execution failed (status ${String(asExecError.status)}), not a normal no-match: ${asExecError.stderr ?? String(err)}`,
    );
  }
}

describe('Part D — the FER class->state mapping table appears exactly once in the repository', () => {
  it('grep finds it only in src/evidence/faceEvidence.ts', () => {
    const hits = grepProductionSource().map((p) => p.replace(/\\/g, '/'));
    expect(hits.length).toBe(1);
    expect(hits[0]).toMatch(/dev\/backend\/src\/evidence\/faceEvidence\.ts$/);
  });

  it('does NOT false-positive on clients/types.ts (a flat ordering constant, not a mapping table)', () => {
    let matched = false;
    try {
      execFileSync('grep', ['-P', MAPPING_ASSOCIATION_PATTERN, join(BACKEND_SRC, 'clients', 'types.ts')], {
        env: { ...process.env, LC_ALL: 'C.UTF-8' },
      });
      matched = true;
    } catch (err) {
      // status 1 = no match (expected here); anything else is a grep failure,
      // not a passing assertion (O-23).
      const asExecError = err as { status?: number; stderr?: Buffer | string };
      if (asExecError.status !== 1) {
        throw new Error(`grep execution failed (status ${String(asExecError.status)}): ${String(asExecError.stderr)}`);
      }
    }
    expect(matched).toBe(false);
  });
});

describe('⛔ no route may import faceEvidence.ts in this phase', () => {
  it('src/routes/ contains no reference to faceEvidence', () => {
    const routesDir = join(BACKEND_SRC, 'routes');
    if (!existsSync(routesDir)) {
      // No routes directory yet (C6 not built) — absence is a pass.
      expect(true).toBe(true);
      return;
    }
    for (const file of readdirSync(routesDir)) {
      const full = join(routesDir, file);
      if (!file.endsWith('.ts')) continue;
      let matched = false;
      try {
        execFileSync('grep', ['-n', 'faceEvidence', full]);
        matched = true;
      } catch (err) {
        const asExecError = err as { status?: number };
        if (asExecError.status !== 1) throw err;
      }
      expect(matched).toBe(false);
    }
  });
});

// ⛔ Fusion parameter guard (O-7): superseded here by
// test/unit/params/o7Guard.test.ts as of C4. C3's blanket "the six symbol
// names may never appear in src/ or test/" guard was correct for C3, where
// nothing legitimately named them — but C4's entire job is injecting these
// symbols via env-var names (FUSION_W_FACE), REQUIRED_SYMBOLS, and prose
// explaining the placeholder choice, which a blanket ban cannot tell apart
// from an actual assigned value. The O-7 guard catches the assignment
// specifically (`W_face = 0.5`, `"tau_distress": 0.6`) while permitting
// mentions. See C4_PLAN.md §4.
