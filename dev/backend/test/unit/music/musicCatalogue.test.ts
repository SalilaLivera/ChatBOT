import { describe, expect, it } from 'vitest';
import { getMusicCatalogue, selectThreeSongs, type CatalogueSong } from '../../../src/content/musicCatalogue.js';

const YOUTUBE_WATCH = /^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{6,}$/;

describe('music catalogue — shape and size (§D)', () => {
  it('exactly 12 Sinhala entries', () => {
    expect(getMusicCatalogue('si')).toHaveLength(12);
  });

  it('exactly 12 English entries', () => {
    expect(getMusicCatalogue('en')).toHaveLength(12);
  });

  it('every catalogue entry has a unique id, across both languages', () => {
    const all = [...getMusicCatalogue('si'), ...getMusicCatalogue('en')];
    const ids = all.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('no duplicate URLs, across both languages', () => {
    const all = [...getMusicCatalogue('si'), ...getMusicCatalogue('en')];
    const urls = all.map((s) => s.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("every entry's own `language` field matches the catalogue bucket it is stored under", () => {
    for (const song of getMusicCatalogue('si')) expect(song.language).toBe('si');
    for (const song of getMusicCatalogue('en')) expect(song.language).toBe('en');
  });

  it('⛔ every URL is a plain youtube.com/watch?v= link — no shortener, no arbitrary domain', () => {
    for (const song of [...getMusicCatalogue('si'), ...getMusicCatalogue('en')]) {
      expect(song.url).toMatch(YOUTUBE_WATCH);
    }
  });

  it('every entry has a non-empty title and artist', () => {
    for (const song of [...getMusicCatalogue('si'), ...getMusicCatalogue('en')]) {
      expect(song.title.length).toBeGreaterThan(0);
      expect(song.artist.length).toBeGreaterThan(0);
    }
  });
});

describe('music catalogue — deterministic selection (§E)', () => {
  const catalogue = getMusicCatalogue('en'); // 12 entries, fixed order

  it('returns exactly 3 songs', () => {
    expect(selectThreeSongs(catalogue, 0)).toHaveLength(3);
  });

  it('no duplicates within one offer', () => {
    for (const turnIndex of [0, 1, 5, 9, 11, 12, 23, 100]) {
      const [a, b, c] = selectThreeSongs(catalogue, turnIndex);
      expect(new Set([a.id, b.id, c.id]).size).toBe(3);
    }
  });

  it('is deterministic — same turnIndex always returns the same 3 songs', () => {
    const first = selectThreeSongs(catalogue, 7);
    const second = selectThreeSongs(catalogue, 7);
    expect(first).toEqual(second);
  });

  it('rotation advances across turns — turnIndex 0 and 1 differ', () => {
    const turn0 = selectThreeSongs(catalogue, 0).map((s) => s.id);
    const turn1 = selectThreeSongs(catalogue, 1).map((s) => s.id);
    expect(turn0).not.toEqual(turn1);
  });

  it('wraparound works at the catalogue boundary (index 11 of 12)', () => {
    const [a, b, c] = selectThreeSongs(catalogue, 11);
    // start=11 -> [11, 0, 1] (wraps past the end back to the start)
    expect(a.id).toBe(catalogue[11]!.id);
    expect(b.id).toBe(catalogue[0]!.id);
    expect(c.id).toBe(catalogue[1]!.id);
  });

  it('turnIndex beyond the catalogue length wraps via modulo (turnIndex=12 === turnIndex=0)', () => {
    expect(selectThreeSongs(catalogue, 12)).toEqual(selectThreeSongs(catalogue, 0));
  });

  it('every selected song belongs to the catalogue passed in — no fabricated entries', () => {
    const ids = new Set(catalogue.map((s) => s.id));
    for (const turnIndex of [0, 3, 8, 11]) {
      for (const song of selectThreeSongs(catalogue, turnIndex)) {
        expect(ids.has(song.id)).toBe(true);
      }
    }
  });

  it('throws rather than silently misbehaving on a catalogue smaller than 3', () => {
    const tiny: CatalogueSong[] = [
      { id: 'x-1', title: 't', artist: 'a', language: 'en', url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa' },
    ];
    expect(() => selectThreeSongs(tiny, 0)).toThrow();
  });
});
