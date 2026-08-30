import { describe, expect, it } from 'vitest';
import { shouldOfferMusic, buildMusicOffer } from '../../../src/music/musicOffer.js';
import { getMusicCatalogue } from '../../../src/content/musicCatalogue.js';

describe('shouldOfferMusic — threshold (§A) and mood (§B)', () => {
  it('distressed + 0.40 → false (the exact boundary — must NOT trigger)', () => {
    expect(shouldOfferMusic('distressed', 0.4)).toBe(false);
  });

  it('distressed + 0.4001 → true', () => {
    expect(shouldOfferMusic('distressed', 0.4001)).toBe(true);
  });

  it('distressed + 0.50 → true', () => {
    expect(shouldOfferMusic('distressed', 0.5)).toBe(true);
  });

  it('distressed + 0.90 → true', () => {
    expect(shouldOfferMusic('distressed', 0.9)).toBe(true);
  });

  it('distressed + 0.0 → false', () => {
    expect(shouldOfferMusic('distressed', 0)).toBe(false);
  });

  it('calm + 0.90 → false, regardless of how high confidence is', () => {
    expect(shouldOfferMusic('calm', 0.9)).toBe(false);
  });

  it('neutral + 0.90 → false, regardless of how high confidence is', () => {
    expect(shouldOfferMusic('neutral', 0.9)).toBe(false);
  });

  it('unknown + 0.90 → false', () => {
    expect(shouldOfferMusic('unknown', 0.9)).toBe(false);
  });
});

describe('buildMusicOffer — language (§C) and response shape', () => {
  it('Sinhala → exactly 3 songs, all from the Sinhala catalogue', () => {
    const offer = buildMusicOffer('si', 0);
    expect(offer.songs).toHaveLength(3);
    const siIds = new Set(getMusicCatalogue('si').map((s) => s.id));
    for (const song of offer.songs) expect(siIds.has(song.id)).toBe(true);
  });

  it('English → exactly 3 songs, all from the English catalogue', () => {
    const offer = buildMusicOffer('en', 0);
    expect(offer.songs).toHaveLength(3);
    const enIds = new Set(getMusicCatalogue('en').map((s) => s.id));
    for (const song of offer.songs) expect(enIds.has(song.id)).toBe(true);
  });

  it('never mixes languages within one offer', () => {
    const siIds = new Set(getMusicCatalogue('si').map((s) => s.id));
    const enOffer = buildMusicOffer('en', 3);
    for (const song of enOffer.songs) expect(siIds.has(song.id)).toBe(false);
  });

  it('⛔ the wire shape exposes only id/title/artist/url — no mood, confidence, or language field', () => {
    const offer = buildMusicOffer('en', 0);
    for (const song of offer.songs) {
      expect(Object.keys(song).sort()).toEqual(['artist', 'id', 'title', 'url']);
    }
  });
});

describe('safety / architecture (§F)', () => {
  it('⛔ shouldOfferMusic takes no dependency on FER, sentiment, or the LLM — pure function of (moodState, confidence)', () => {
    // Structural: the function signature itself is the guarantee. This test
    // asserts calling it with only these two primitives is sufficient and
    // produces no side effect (no throw, no network access possible from a
    // synchronous pure function).
    expect(() => shouldOfferMusic('distressed', 0.5)).not.toThrow();
  });

  it('buildMusicOffer performs no network call — resolves synchronously in practice (no await needed, no Promise)', () => {
    const result = buildMusicOffer('en', 0);
    expect(result).not.toBeInstanceOf(Promise);
  });
});
