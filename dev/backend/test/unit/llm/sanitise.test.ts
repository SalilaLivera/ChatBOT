/**
 * Markdown sanitiser tests.
 *
 * ⛔ THIS IS THE SECURITY BOUNDARY. LLM output is untrusted content, and this
 * module is authoritative — the frontend renderer is defence in depth, not the
 * primary control.
 *
 * The link cases mirror `dev/frontend/src/components/AssistantResponseContent.test.ts`
 * exactly. The two implementations MUST agree; they diverged once already.
 */

import { describe, expect, it } from 'vitest';

import {
  sanitiseMessage,
  sanitiseSectionContent,
  sanitiseSectionTitle,
} from '../../../src/llm/sanitise.js';

/** No scheme, no host, no residual markdown link syntax may survive. */
function containsUrl(text: string): boolean {
  return /https?:\/\/|ftp:\/\/|www\.|\]\(/i.test(text);
}

describe('links — keep the label, destroy the URL', () => {
  it('keeps the label', () => {
    const r = sanitiseMessage('[See NHS guidance](https://example.com)');
    expect(r.text).toBe('See NHS guidance');
    expect(containsUrl(r.text)).toBe(false);
  });

  it('leaves the sentence grammatical', () => {
    const r = sanitiseMessage('Please see [the NHS guidance](https://example.com) for more.');
    expect(r.text).toBe('Please see the NHS guidance for more.');
  });

  it('destroys a hallucinated medical URL', () => {
    const r = sanitiseMessage('Read [this study](https://evil.example.com/med?x=1).');
    expect(r.text).toContain('this study');
    expect(r.text).not.toContain('evil.example.com');
    expect(containsUrl(r.text)).toBe(false);
  });

  it('counts what it removed', () => {
    const r = sanitiseMessage('[a](https://x.com) and [b](https://y.com)');
    expect(r.removed.links).toBe(2);
    expect(r.modified).toBe(true);
  });
});

describe('bare URLs — removed entirely, no label to keep', () => {
  it('removes http(s)', () => {
    const r = sanitiseMessage('Visit https://example.com/path?x=1 now.');
    expect(containsUrl(r.text)).toBe(false);
    expect(r.removed.bareUrls).toBe(1);
  });

  it('removes schemeless www hosts', () => {
    expect(containsUrl(sanitiseMessage('See www.example.com too.').text)).toBe(false);
  });

  it('removes an angle-bracket autolink', () => {
    expect(containsUrl(sanitiseMessage('<https://example.com>').text)).toBe(false);
  });
});

describe('images — removed whole, alt text included', () => {
  it('removes the image and its alt text', () => {
    const r = sanitiseMessage('![a scan photo](https://example.com/scan.png)');
    expect(r.text).toBe('');
    expect(r.removed.images).toBe(1);
  });

  it('does not leave a stray "!" behind', () => {
    // Regression guard: images must be stripped BEFORE links, or the link rule
    // eats "[alt](url)" and leaves the "!".
    const r = sanitiseMessage('Here ![alt](https://e.com/i.png) done.');
    expect(r.text).not.toContain('!');
  });
});

describe('HTML — tags removed, inner text kept inert', () => {
  it('strips tags', () => {
    expect(sanitiseMessage('Raw <b>HTML</b> here').text).toBe('Raw HTML here');
  });

  it('neutralises a script tag', () => {
    const r = sanitiseMessage('<script>alert(1)</script>');
    expect(r.text).toBe('alert(1)');
    expect(r.text).not.toContain('<');
  });
});

describe('headings', () => {
  it('⛔ removes ALL heading markers from a message', () => {
    // The app owns top-level typography; `message` never carries headings.
    const r = sanitiseMessage('### Heading\nbody');
    expect(r.text).toBe('Heading\nbody');
  });

  it('keeps ### and #### inside section content', () => {
    const r = sanitiseSectionContent('### Sub\nbody');
    expect(r.text).toBe('### Sub\nbody');
  });

  it('⛔ demotes # and ## even inside section content', () => {
    // Reserved for the app's own typography at every level.
    expect(sanitiseSectionContent('# Big').text).toBe('Big');
    expect(sanitiseSectionContent('## Also big').text).toBe('Also big');
  });
});

describe('other forbidden constructs', () => {
  it('unwraps code fences, keeping the prose inside', () => {
    const r = sanitiseSectionContent('```\njust words\n```');
    expect(r.text).toBe('just words');
    expect(r.removed.codeBlocks).toBe(1);
  });

  it('unwraps inline code', () => {
    expect(sanitiseMessage('use `rest` today').text).toBe('use rest today');
  });

  it('unwraps blockquotes, which mimic the system voice', () => {
    expect(sanitiseMessage('> quoted').text).toBe('quoted');
  });

  it('flattens a table rather than rendering one', () => {
    const r = sanitiseSectionContent('| a | b |\n| --- | --- |\n| 1 | 2 |');
    expect(r.text).not.toContain('|');
    expect(r.removed.tables).toBeGreaterThan(0);
  });

  it('drops footnote definitions', () => {
    expect(sanitiseSectionContent('[^1]: a note').text).toBe('');
  });
});

describe('allowed syntax survives untouched', () => {
  it('keeps bold, italic and both list kinds', () => {
    const input = '**bold** and *italic*\n\n- one\n- two\n\n1. first\n2. second';
    const r = sanitiseSectionContent(input);
    expect(r.text).toContain('**bold**');
    expect(r.text).toContain('*italic*');
    expect(r.text).toContain('- one');
    expect(r.text).toContain('1. first');
  });

  it('clamps nesting to one level', () => {
    const r = sanitiseSectionContent('- a\n      - deeply nested');
    // Six spaces of indent collapse to the single permitted level.
    expect(r.text).toContain('  - deeply nested');
    expect(r.text).not.toContain('      - ');
  });

  it('reports clean text as unmodified', () => {
    expect(sanitiseMessage('Just plain words.').modified).toBe(false);
  });
});

describe('section titles are plain text', () => {
  it('strips emphasis markers rather than preserving them', () => {
    expect(sanitiseSectionTitle('**What this may mean**').text).toBe('What this may mean');
  });

  it('strips a heading marker', () => {
    expect(sanitiseSectionTitle('### When to seek help').text).toBe('When to seek help');
  });

  it('collapses whitespace', () => {
    expect(sanitiseSectionTitle('  spaced   out  ').text).toBe('spaced out');
  });

  it('⛔ removes URLs from a title', () => {
    expect(containsUrl(sanitiseSectionTitle('See https://x.com').text)).toBe(false);
  });
});
