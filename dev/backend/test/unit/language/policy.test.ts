import { describe, expect, it } from 'vitest';
import { LanguagePolicyNotImplementedError, routeLanguage } from '../../../src/language/policy.js';

describe('routeLanguage', () => {
  it('si always routes to sentiment regardless of policy', () => {
    for (const policy of ['face_only', 'reject'] as const) {
      const decision = routeLanguage('si', policy);
      expect(decision).toEqual({ route: 'sentiment', languageDetected: 'si' });
    }
  });

  it('face_only policy drops text evidence for other/mixed, no LLM, no network call', () => {
    const other = routeLanguage('other', 'face_only');
    expect(other).toEqual({ route: 'face_only', languageDetected: 'other', textEvidenceDropped: true });
    const mixed = routeLanguage('mixed', 'face_only');
    expect(mixed).toEqual({ route: 'face_only', languageDetected: 'mixed', textEvidenceDropped: true });
  });

  it('reject policy fails visibly rather than silently degrading', () => {
    const decision = routeLanguage('other', 'reject');
    expect(decision).toEqual({ route: 'reject', languageDetected: 'other', textEvidenceDropped: true });
  });

  it('⛔ translate errors clearly — it is an explicit off switch with no implementation', () => {
    expect(() => routeLanguage('other', 'translate')).toThrow(LanguagePolicyNotImplementedError);
    expect(() => routeLanguage('other', 'translate')).toThrow(/no implementation/i);
  });

  it('⛔ singlish_llm errors clearly — it is an explicit off switch with no implementation', () => {
    expect(() => routeLanguage('other', 'singlish_llm')).toThrow(LanguagePolicyNotImplementedError);
    expect(() => routeLanguage('other', 'singlish_llm')).toThrow(/no implementation/i);
  });

  it('mixed routes the same as other under every implemented policy (§5.6.8: undefined until sign-off)', () => {
    expect(routeLanguage('mixed', 'face_only').route).toBe(routeLanguage('other', 'face_only').route);
    expect(routeLanguage('mixed', 'reject')).toEqual(
      expect.objectContaining({ route: 'reject', textEvidenceDropped: true, languageDetected: 'mixed' }),
    );
  });
});
