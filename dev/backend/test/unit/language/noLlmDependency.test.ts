/**
 * ⛔ C5 must add no LLM, no network call, no transliteration dependency
 * (C5_PROMPT.md prohibition 4; §5.6.9). Verified two ways: no known LLM SDK
 * is a dependency of dev/backend, and src/language/ makes no fetch/network
 * call of its own (it is pure string/regex logic operating on its argument).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const BACKEND_ROOT = join(__dirname, '..', '..', '..');

describe('⛔ no LLM dependency was introduced by C5', () => {
  it('package.json declares no known LLM SDK', () => {
    const pkg = JSON.parse(readFileSync(join(BACKEND_ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    const knownLlmPackages = [
      'openai',
      'anthropic',
      '@anthropic-ai/sdk',
      '@google/generative-ai',
      'langchain',
      'cohere-ai',
      'ollama',
    ];
    for (const name of knownLlmPackages) {
      expect(Object.keys(allDeps)).not.toContain(name);
    }
  });

  it('src/language/*.ts makes no network call — no fetch, no http/https import, no undici Pool', () => {
    for (const file of ['detect.ts', 'policy.ts']) {
      const source = readFileSync(join(BACKEND_ROOT, 'src', 'language', file), 'utf8');
      expect(source).not.toMatch(/\bfetch\s*\(/);
      expect(source).not.toMatch(/require\(['"](https?|undici)['"]\)/);
      expect(source).not.toMatch(/from ['"](https?|undici)['"]/);
    }
  });
});
