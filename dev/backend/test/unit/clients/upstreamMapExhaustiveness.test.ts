import { describe, expect, it } from 'vitest';
import {
  FER_ALL_ERROR_CODES,
  FER_MAPPED_CODES,
  SENTIMENT_ALL_ERROR_CODES,
  SENTIMENT_MAPPED_CODES,
} from '../../../src/errors/upstreamMap.js';

describe('upstreamMap exhaustiveness (§6 — a code added upstream must fail a test, not fall through)', () => {
  it('covers every FER errors.py ALL_ERROR_CODES entry, including text_too_long-equivalent edge codes', () => {
    expect(FER_MAPPED_CODES).toEqual(FER_ALL_ERROR_CODES);
  });

  it('covers every sentiment errors.py ALL_ERROR_CODES entry, including the unreachable text_too_long', () => {
    expect(SENTIMENT_MAPPED_CODES).toEqual(SENTIMENT_ALL_ERROR_CODES);
    expect(SENTIMENT_MAPPED_CODES.has('text_too_long')).toBe(true);
  });
});
