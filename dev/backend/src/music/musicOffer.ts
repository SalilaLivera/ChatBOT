/**
 * Music-recommendation decision layer.
 *
 * ⛔ APPLICATION LOGIC, NOT LLM LOGIC. Nothing in this file is imported by,
 * or imports from, `src/llm/`. The trigger and selection below run entirely
 * from the already-fused mood result and the already-detected language —
 * both computed upstream of any LLM call — and their output is attached to
 * the response alongside, never through, the LLM's reply.
 *
 * mood pipeline → shouldOfferMusic() → language → catalogue → 3 songs →
 * music_offer → frontend. Groq is nowhere in this chain.
 */

import type { CatalogueSong } from '../content/musicCatalogue.js';
import { getMusicCatalogue, selectThreeSongs } from '../content/musicCatalogue.js';
import type { Language, MoodState, MusicOffer } from '../llm/contract.js';

/**
 * Trigger, exactly as approved: `distressed` AND confidence STRICTLY greater
 * than 0.4. `0.40` itself does not trigger — this is deliberately `>`, not
 * `>=`, and must never be "corrected" to `>=` without a new decision.
 *
 * Uses the REAL fused mood result the caller already has — this function
 * takes no dependency on FER, sentiment, or the LLM, and performs no
 * analysis of its own. See `routes/conversations.routes.ts` for the one
 * call site, where `moodState`/`confidence` come straight from
 * `moodOutcome.body` (the C6-fused output), not recomputed.
 */
export function shouldOfferMusic(moodState: MoodState, confidence: number): boolean {
  return moodState === 'distressed' && confidence > 0.4;
}

function toCatalogueSong(song: CatalogueSong): { id: string; title: string; artist: string; url: string } {
  // ⛔ Choke point: `language` is deliberately dropped here. The wire shape
  // (`MusicOfferSong`) never carries it — the frontend renders 3 buttons and
  // has no need to branch on language, and dropping it keeps the response
  // from repeating information already implied by picking this catalogue.
  return { id: song.id, title: song.title, artist: song.artist, url: song.url };
}

/**
 * Builds the offer for a triggered turn. Caller decides whether to call
 * this at all (via `shouldOfferMusic`) — this function does not re-check
 * the trigger, so it must never be called unconditionally.
 *
 * `language` must already be the same `'si'|'en'` value the LLM reply was
 * generated in (`toLlmLanguage()` in the route) — no second language
 * detection happens here.
 *
 * `turnIndex` drives the deterministic rotation (§6 of the approved plan) —
 * see `selectThreeSongs` for exactly how.
 */
export function buildMusicOffer(language: Language, turnIndex: number): MusicOffer {
  const catalogue = getMusicCatalogue(language);
  const [a, b, c] = selectThreeSongs(catalogue, turnIndex);
  return { songs: [toCatalogueSong(a), toCatalogueSong(b), toCatalogueSong(c)] };
}
