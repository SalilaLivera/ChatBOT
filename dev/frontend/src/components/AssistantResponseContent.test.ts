/**
 * Sanitisation tests for the assistant response renderer.
 *
 * These assert the SECURITY properties of `stripUnsupportedMarkup`, which runs
 * before any parsing and is the frontend's half of the defence. The backend's
 * `src/llm/sanitise.ts` is authoritative and runs first; this layer exists so a
 * second client, the mock path, or a future integration inherits the same
 * guarantees.
 *
 * ⛔ SEMANTICS MUST STAY IDENTICAL TO THE BACKEND. If one side changes, both
 * change. The link rule below is the case that already diverged once.
 *
 * NOTE ON RUNNING THESE: `jest` is present in devDependencies but the project
 * has no jest config and no TypeScript transform, so `npm test` cannot execute
 * this file yet. Enabling it needs `jest-expo` — a new dependency, which is the
 * owner's call, not mine. The assertions are written so they run unchanged the
 * moment a preset is configured. Until then the same cases are verified
 * directly against the compiled logic.
 */

import { stripUnsupportedMarkup } from './AssistantResponseContent';

/** No scheme, no host, no angle-bracket autolink may survive anywhere. */
function containsUrl(text: string): boolean {
  return /https?:\/\/|ftp:\/\/|www\.|\]\(/i.test(text);
}

describe('stripUnsupportedMarkup — links', () => {
  // The owner decision, 2026-08-30: keep the label, destroy the URL.
  it('keeps the link label and destroys the URL', () => {
    const out = stripUnsupportedMarkup('[See NHS guidance](https://example.com)');
    expect(out).toBe('See NHS guidance');
    expect(containsUrl(out)).toBe(false);
  });

  it('keeps the sentence grammatical around a stripped link', () => {
    const out = stripUnsupportedMarkup('Please see [the NHS guidance](https://example.com) for more.');
    expect(out).toBe('Please see the NHS guidance for more.');
    expect(containsUrl(out)).toBe(false);
  });

  it('destroys a hallucinated medical URL while keeping the words', () => {
    const out = stripUnsupportedMarkup('Read [this study](https://evil.example.com/med?x=1).');
    expect(out).toContain('this study');
    expect(out).not.toContain('evil.example.com');
    expect(containsUrl(out)).toBe(false);
  });
});

describe('stripUnsupportedMarkup — bare URLs', () => {
  it('removes bare http(s) URLs entirely — there is no label to keep', () => {
    const out = stripUnsupportedMarkup('Visit https://example.com/path?x=1 now.');
    expect(out).not.toContain('example.com');
    expect(containsUrl(out)).toBe(false);
  });

  it('removes schemeless www hosts, which readers treat as links anyway', () => {
    const out = stripUnsupportedMarkup('See www.example.com too.');
    expect(out).not.toContain('example.com');
    expect(containsUrl(out)).toBe(false);
  });
});

describe('stripUnsupportedMarkup — images', () => {
  // Unlike links, images are removed WHOLE: alt text is not prose and its loss
  // does not break a sentence.
  it('removes an image entirely, alt text included', () => {
    const out = stripUnsupportedMarkup('![a scan photo](https://example.com/scan.png)');
    expect(out.trim()).toBe('');
    expect(containsUrl(out)).toBe(false);
  });

  it('does not leave a stray "!" when an image sits in a sentence', () => {
    const out = stripUnsupportedMarkup('Here ![alt](https://e.com/i.png) done.');
    expect(out).not.toContain('!');
    expect(containsUrl(out)).toBe(false);
  });
});

describe('stripUnsupportedMarkup — HTML', () => {
  it('strips tags and keeps the inner text as inert plain text', () => {
    expect(stripUnsupportedMarkup('Raw <b>HTML</b> here')).toBe('Raw HTML here');
  });

  it('neutralises a script tag', () => {
    const out = stripUnsupportedMarkup('<script>alert(1)</script>');
    expect(out).toBe('alert(1)');
    expect(out).not.toContain('<');
  });
});

describe('stripUnsupportedMarkup — allowed syntax survives', () => {
  it('leaves bold, italic and list markers for the parser', () => {
    const input = '**bold** and *italic*\n- one\n- two\n1. first';
    const out = stripUnsupportedMarkup(input);
    expect(out).toContain('**bold**');
    expect(out).toContain('*italic*');
    expect(out).toContain('- one');
    expect(out).toContain('1. first');
  });
});
