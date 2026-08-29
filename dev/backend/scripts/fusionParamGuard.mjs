// O-7 — the fusion parameter guard. Catches a numeric literal ASSIGNED to a
// fusion parameter symbol in shipped source — an `=` or a `:` directly
// followed by a digit, immediately after one of the six symbol names —
// while permitting the same symbol named in prose, as an env-var key
// (FUSION_W_FACE is a different token — different case, different prefix),
// or read from process.env / os.environ in test scaffolding.
//
// C3's blanket "ban the six symbol names outright" guard forced the removal
// of a doc comment that merely NAMED W_face while explaining why face scores
// must not be one-hot (C3_DONE.md §4.2) — untenable in C4, whose entire job
// is injecting these symbols via env-var names, REQUIRED_SYMBOLS, and prose.
// This guard is deliberately narrower: it requires an assignment operator
// (`=` or `:`) directly followed by a numeric literal.
//
// Implemented as pure Node (no external `grep` subprocess) — C3 found that
// execFileSync spawning grep.exe directly on Windows silently mangles a
// literal backslash in argv, producing a guard that matches nothing without
// ever erroring. Pure JS RegExp has no such failure mode.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FUSION_PARAM_SYMBOLS = [
  'W_face',
  'W_text',
  'tau_face_min',
  'tau_text_min',
  'tau_fusion_min',
  'tau_distress',
];

const EXCLUDED_DIR_NAMES = new Set([
  'node_modules',
  'dist',
  '.venv',
  '__pycache__',
  '.git',
  '.pytest_cache',
  'test', // test scaffolding legitimately constructs placeholder parameter objects
]);

const INCLUDED_EXTENSIONS = new Set(['.ts', '.js', '.mjs', '.cjs', '.py']);

function walk(dir, files = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (EXCLUDED_DIR_NAMES.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(full, files);
    } else if (INCLUDED_EXTENSIONS.has(extname(entry))) {
      files.push(full);
    }
  }
  return files;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildAssignmentPattern(symbol) {
  const escaped = escapeRegExp(symbol);
  // (?<![A-Za-z0-9_]) — not preceded by an identifier char, so FUSION_W_FACE
  // (different case, different prefix) never matches W_face. Optional quote,
  // then `=` or `:`, then a numeric literal — an assignment, not a mention.
  return new RegExp(`(?<![A-Za-z0-9_])['"]?${escaped}['"]?\\s*[:=]\\s*[0-9]`, 'g');
}

/**
 * @param {string[]} rootDirs absolute directory paths to scan
 * @returns {{file: string, symbol: string, line: number, snippet: string}[]}
 */
export function scanForParameterAssignment(rootDirs) {
  const violations = [];
  for (const root of rootDirs) {
    for (const file of walk(root)) {
      const content = readFileSync(file, 'utf8');
      for (const symbol of FUSION_PARAM_SYMBOLS) {
        const pattern = buildAssignmentPattern(symbol);
        const match = pattern.exec(content);
        if (match) {
          const line = content.slice(0, match.index).split('\n').length;
          violations.push({ file, symbol, line, snippet: match[0] });
        }
      }
    }
  }
  return violations;
}

// CLI entrypoint: `node scripts/fusionParamGuard.mjs <dir> [<dir> ...]`
const isMain = process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);
if (isMain) {
  const dirs = process.argv.slice(2);
  if (dirs.length === 0) {
    console.error('usage: node fusionParamGuard.mjs <dir> [<dir> ...]');
    process.exit(2);
  }
  const violations = scanForParameterAssignment(dirs);
  if (violations.length > 0) {
    console.error('O-7 guard FAILED — fusion parameter value(s) assigned in shipped source:');
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line}: ${v.symbol} — "${v.snippet}"`);
    }
    process.exit(1);
  }
  console.log('O-7 guard passed — no fusion parameter assignment found in shipped source.');
}
