import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC_DIR = join(__dirname, '..', '..', 'src');

function listTsFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...listTsFiles(full));
    } else if (entry.endsWith('.ts')) {
      files.push(full);
    }
  }
  return files;
}

describe('process.env module boundary (§2.1 rule 4)', () => {
  it('is read only inside src/config/', () => {
    const offenders: string[] = [];
    for (const file of listTsFiles(SRC_DIR)) {
      const rel = relative(SRC_DIR, file).replace(/\\/g, '/');
      if (rel.startsWith('config/')) continue;
      const content = readFileSync(file, 'utf8');
      if (/process\.env/.test(content)) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
});
