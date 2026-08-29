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
const BACKEND_TEST = toPosix(join(__dirname, '..', '..'));

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
      { encoding: 'utf8' },
    );
    return out.split('\n').filter(Boolean);
  } catch (err) {
    // grep exits 1 with empty stdout when there are no matches at all.
    const asExecError = err as { status?: number; stdout?: string };
    if (asExecError.status === 1) return [];
    throw err;
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
      execFileSync('grep', ['-P', MAPPING_ASSOCIATION_PATTERN, join(BACKEND_SRC, 'clients', 'types.ts')]);
      matched = true;
    } catch (err) {
      const asExecError = err as { status?: number };
      if (asExecError.status !== 1) throw err;
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

describe('⛔ no fusion parameter symbol anywhere in src/ or test/', () => {
  // Symbols built by concatenation, not as literal substrings, so this
  // file — which legitimately names them for the grep target — is not
  // itself a false positive when the same grep is run over test/.
  const FUSION_PARAM_SYMBOLS = [
    ['W_', 'face'].join(''),
    ['W_', 'text'].join(''),
    ['tau_', 'face_min'].join(''),
    ['tau_', 'text_min'].join(''),
    ['tau_', 'fusion_min'].join(''),
    ['tau_', 'distress'].join(''),
  ];

  it.each(FUSION_PARAM_SYMBOLS)('%s does not appear in dev/backend/src or dev/backend/test', (symbol) => {
    let matched = false;
    try {
      execFileSync('grep', [
        '-rln',
        symbol,
        '--include=*.ts',
        '--exclude-dir=node_modules',
        '--exclude-dir=dist',
        '--exclude=ciGreps.test.ts',
        BACKEND_SRC,
        BACKEND_TEST,
      ]);
      matched = true;
    } catch (err) {
      const asExecError = err as { status?: number };
      if (asExecError.status !== 1) throw err;
    }
    expect(matched).toBe(false);
  });
});
