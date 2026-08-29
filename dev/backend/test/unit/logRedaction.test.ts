import { Writable } from 'node:stream';
import pino from 'pino';
import { describe, expect, it } from 'vitest';

// Mirrors the REDACT_PATHS in src/logging/logger.ts. Constructed directly
// against a capturable stream here rather than importing the module-level
// logger singleton, so the test can assert on the exact bytes written.
const REDACT_PATHS = [
  'message',
  'text',
  'body.message',
  'body.text',
  '*.message',
  '*.text',
  '*.detail',
  'detail',
];

describe('logger redaction (§9.5 — message text is never logged at any level)', () => {
  it('redacts a simulated message body from a log line', () => {
    const chunks: string[] = [];
    const sink = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(chunk.toString());
        cb();
      },
    });

    const logger = pino(
      { redact: { paths: REDACT_PATHS, censor: '[REDACTED]' } },
      sink,
    );

    const SECRET = 'I feel really overwhelmed and scared today';
    logger.info({ text: SECRET, requestId: 'abc-123' }, 'mood request received');

    const logged = chunks.join('');
    expect(logged).not.toContain(SECRET);
    expect(logged).toContain('[REDACTED]');
    expect(logged).toContain('abc-123');
  });
});
