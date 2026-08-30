/**
 * Parser tests — the schema trust boundary.
 *
 * Two behaviours matter most and are asserted repeatedly:
 *   - `sections` is OPTIONAL (D-1). Absent, null and [] all mean "no sections",
 *     and a short conversational reply is never forced into topics.
 *   - Caps TRUNCATE rather than reject. A slightly over-long reply still helps
 *     someone; a rejected one does not.
 *
 * ⛔ No error raised here may carry the offending payload — it is model output
 * derived from a user's message, and an error message ends up in a log.
 */

import { describe, expect, it } from 'vitest';

import { MAX_SECTIONS, MAX_SECTION_TITLE_CHARS } from '../../../src/llm/contract.js';
import { LlmMalformedOutputError } from '../../../src/llm/errors.js';
import { parseGeneratedContent } from '../../../src/llm/parse.js';

describe('valid output', () => {
  it('parses a message with no sections key at all', () => {
    const r = parseGeneratedContent(JSON.stringify({ message: 'I am here with you.' }));
    expect(r.content.message).toBe('I am here with you.');
    expect(r.content.sections).toBeUndefined();
    expect(r.repair).toBe('none');
    expect(r.truncated).toBe(false);
  });

  it('treats sections: [] as no sections and omits the key', () => {
    const r = parseGeneratedContent(JSON.stringify({ message: 'hello', sections: [] }));
    expect(r.content.sections).toBeUndefined();
  });

  it('treats sections: null as no sections', () => {
    const r = parseGeneratedContent(JSON.stringify({ message: 'hello', sections: null }));
    expect(r.content.sections).toBeUndefined();
  });

  it('parses sections when present', () => {
    const r = parseGeneratedContent(
      JSON.stringify({
        message: 'Swelling is common late on.',
        sections: [{ title: 'What you can try', content: '- Rest\n- Water' }],
      }),
    );
    expect(r.content.sections).toHaveLength(1);
    expect(r.content.sections![0]!.title).toBe('What you can try');
  });
});

describe('the single permitted repair', () => {
  it('extracts a JSON object wrapped in prose', () => {
    const r = parseGeneratedContent('Sure! {"message":"hi"} Hope that helps.');
    expect(r.content.message).toBe('hi');
    expect(r.repair).toBe('extracted_json_object');
  });

  it('extracts from a fenced block', () => {
    const r = parseGeneratedContent('```json\n{"message":"hi"}\n```');
    expect(r.content.message).toBe('hi');
    expect(r.repair).toBe('extracted_json_object');
  });

  it('handles braces inside string values without ending the object early', () => {
    // Brace counting must be string-aware, or "}" inside a value truncates it.
    const r = parseGeneratedContent('noise {"message":"a } b"} noise');
    expect(r.content.message).toBe('a } b');
  });

  it('does NOT re-attempt repair on a schema failure', () => {
    // Re-extracting yields the same object and the same schema error; retrying
    // would just burn time. The thrown error proves it stopped.
    expect(() => parseGeneratedContent('{"wrong":"shape"}')).toThrow(LlmMalformedOutputError);
  });
});

describe('rejects structurally unusable output', () => {
  it('rejects empty output', () => {
    expect(() => parseGeneratedContent('')).toThrow(LlmMalformedOutputError);
  });

  it('rejects text with no JSON object', () => {
    expect(() => parseGeneratedContent('I cannot do that.')).toThrow(LlmMalformedOutputError);
  });

  it('rejects a missing message', () => {
    expect(() => parseGeneratedContent('{"sections":[]}')).toThrow(LlmMalformedOutputError);
  });

  it('rejects an empty message', () => {
    expect(() => parseGeneratedContent('{"message":"   "}')).toThrow(LlmMalformedOutputError);
  });

  it('rejects a non-array sections', () => {
    expect(() => parseGeneratedContent('{"message":"hi","sections":"nope"}')).toThrow(
      LlmMalformedOutputError,
    );
  });

  it('⛔ never puts the payload in the error', () => {
    const secret = 'PATIENT SAID SOMETHING PRIVATE';
    try {
      parseGeneratedContent(`{"message":"","note":"${secret}"}`);
      throw new Error('should have thrown');
    } catch (err) {
      const e = err as LlmMalformedOutputError;
      expect(e).toBeInstanceOf(LlmMalformedOutputError);
      expect(JSON.stringify(e.detail ?? '')).not.toContain(secret);
      expect(JSON.stringify(e.toEnvelope())).not.toContain(secret);
    }
  });
});

describe('caps truncate rather than reject', () => {
  it('caps the number of sections', () => {
    const sections = Array.from({ length: MAX_SECTIONS + 3 }, (_, i) => ({
      title: `T${i}`,
      content: 'body',
    }));
    const r = parseGeneratedContent(JSON.stringify({ message: 'hi', sections }));
    expect(r.content.sections).toHaveLength(MAX_SECTIONS);
    expect(r.truncated).toBe(true);
  });

  it('caps an over-long title', () => {
    const r = parseGeneratedContent(
      JSON.stringify({ message: 'hi', sections: [{ title: 'x'.repeat(200), content: 'b' }] }),
    );
    expect(r.content.sections![0]!.title).toHaveLength(MAX_SECTION_TITLE_CHARS);
    expect(r.truncated).toBe(true);
  });

  it('drops a malformed section without discarding the whole reply', () => {
    const r = parseGeneratedContent(
      JSON.stringify({
        message: 'still useful',
        sections: [{ title: 'good', content: 'body' }, { title: 42 }, null],
      }),
    );
    expect(r.content.message).toBe('still useful');
    expect(r.content.sections).toHaveLength(1);
    expect(r.truncated).toBe(true);
  });

  it('omits the key when every section is dropped', () => {
    const r = parseGeneratedContent(
      JSON.stringify({ message: 'hi', sections: [{ title: '', content: '' }] }),
    );
    expect(r.content.sections).toBeUndefined();
  });
});
