/**
 * App-owned, static music catalogue (music-recommendation feature).
 *
 * ⛔ NOT LLM LOGIC. This file is never imported by anything under
 * `src/llm/`, and nothing in it is ever passed to a provider. See
 * `music/musicOffer.ts` for the trigger and selection that consume it, and
 * `routes/conversations.routes.ts` for the one call site.
 *
 * ⛔ NO YOUTUBE DATA API. These are fixed, owner-approved URLs — every one
 * verified via web research (title, artist, uploader, official/legitimate
 * status) before being added here. Nothing in this file was invented, and
 * nothing here is ever derived from a runtime search. Two entries
 * (Sinhala #6 "Dewaduthiyak" and English #11 "The Night We Met") were
 * supplied and pre-verified directly by the project owner; the remaining 22
 * were researched and cross-checked against search results explicitly
 * titled "Official"/attributed to the artist or label channel.
 *
 * Approved 2026-08-30. Changing a URL here is a content decision, not a
 * refactor — same posture this project already takes with
 * `LANGUAGE_BOUNDS_PROPOSAL.md` and the (currently empty)
 * `MEDICATION_LEXICON` in `llm/outboundFilterPartial.ts`: nothing is
 * invented, everything traceable to its approval.
 */

export interface CatalogueSong {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly language: 'si' | 'en';
  readonly url: string;
}

/** Exactly 3 songs, enforced at compile time — see musicOffer.ts. */
export type ThreeSongs = readonly [CatalogueSong, CatalogueSong, CatalogueSong];

const SINHALA_CATALOGUE: readonly CatalogueSong[] = [
  { id: 'si-01', title: 'Unuhuma (උණුහුම)', artist: 'Tehan Perera', language: 'si', url: 'https://www.youtube.com/watch?v=BW3to4PKTGo' },
  { id: 'si-02', title: 'Unuhuma 2 | Husmath Unui (හුස්මත් උණුයි)', artist: 'Tehan Perera', language: 'si', url: 'https://www.youtube.com/watch?v=vPXfklYG-9Q' },
  { id: 'si-03', title: 'Unuhuma 3 (උණුහුම 3)', artist: 'Tehan Perera', language: 'si', url: 'https://www.youtube.com/watch?v=ZiFr44zTDQA' },
  { id: 'si-04', title: 'Sansarini (සංසාරිණී)', artist: 'Yasas Medagedara', language: 'si', url: 'https://www.youtube.com/watch?v=4eqSk7rVFd4' },
  { id: 'si-05', title: 'Danune Thaniyado (දැනුනේ තනියදෝ)', artist: 'Mahiru Senarathne', language: 'si', url: 'https://www.youtube.com/watch?v=7u04UIJpoGM' },
  // ⛔ Supplied and pre-verified by the project owner (2026-08-30).
  { id: 'si-06', title: 'Dewaduthiyak (දේවදූතියක්)', artist: 'Mihiran ft. Themiya Thejan', language: 'si', url: 'https://www.youtube.com/watch?v=epmgTKHHdsg' },
  { id: 'si-07', title: 'Man Dannawa (මන් දන්නවා)', artist: 'Pamith Mandiv', language: 'si', url: 'https://www.youtube.com/watch?v=qEhYq3G24aI' },
  { id: 'si-08', title: 'Sansara Sihine (සංසාර සිහිනේ)', artist: 'Sanuka', language: 'si', url: 'https://www.youtube.com/watch?v=cwRsQii66Nw' },
  { id: 'si-09', title: 'Premaneeya Susuma', artist: 'Dinupa Kodagoda', language: 'si', url: 'https://www.youtube.com/watch?v=xdItQCzzp7U' },
  { id: 'si-10', title: 'Mudu Uvana Pinbarai', artist: 'Dinupa Kodagoda', language: 'si', url: 'https://www.youtube.com/watch?v=rRpxSMv626A' },
  { id: 'si-11', title: 'Siyumaliye', artist: 'Randhir Witana', language: 'si', url: 'https://www.youtube.com/watch?v=XrbbpD-cnxY' },
  { id: 'si-12', title: 'Sulanga (සුළඟ)', artist: 'Ridma Weerawardena & Thilina Boralessa', language: 'si', url: 'https://www.youtube.com/watch?v=GeEgY7StZSA' },
];

const ENGLISH_CATALOGUE: readonly CatalogueSong[] = [
  { id: 'en-01', title: 'Weightless', artist: 'Marconi Union', language: 'en', url: 'https://www.youtube.com/watch?v=UfcAVejslrU' },
  { id: 'en-02', title: 'Nuvole Bianche', artist: 'Ludovico Einaudi', language: 'en', url: 'https://www.youtube.com/watch?v=CQ8zglIXZi8' },
  { id: 'en-03', title: 'River Flows in You', artist: 'Yiruma', language: 'en', url: 'https://www.youtube.com/watch?v=NPBCbTZWnq0' },
  { id: 'en-04', title: 'Heartbeats', artist: 'José González', language: 'en', url: 'https://www.youtube.com/watch?v=TOsRkcV8pCk' },
  { id: 'en-05', title: 'Bloom', artist: 'The Paper Kites', language: 'en', url: 'https://www.youtube.com/watch?v=8inJtTG_DuU' },
  { id: 'en-06', title: 'Come Away With Me', artist: 'Norah Jones', language: 'en', url: 'https://www.youtube.com/watch?v=yjoEFx3_P9U' },
  { id: 'en-07', title: 'Flightless Bird, American Mouth', artist: 'Iron & Wine', language: 'en', url: 'https://www.youtube.com/watch?v=SgmVhsXq0EQ' },
  { id: 'en-08', title: 'Turning Page', artist: 'Sleeping At Last', language: 'en', url: 'https://www.youtube.com/watch?v=-hb2tecD13s' },
  { id: 'en-09', title: 'Anchor', artist: 'Novo Amor', language: 'en', url: 'https://www.youtube.com/watch?v=OmKAn8rNbKg' },
  { id: 'en-10', title: 'Holocene', artist: 'Bon Iver', language: 'en', url: 'https://www.youtube.com/watch?v=TWcyIpul8OE' },
  // ⛔ Supplied and pre-verified by the project owner (2026-08-30).
  { id: 'en-11', title: 'The Night We Met', artist: 'Lord Huron', language: 'en', url: 'https://www.youtube.com/watch?v=wGF7PswOENQ' },
  { id: 'en-12', title: 'White Winter Hymnal', artist: 'Fleet Foxes', language: 'en', url: 'https://www.youtube.com/watch?v=DrQRS40OKNE' },
];

const CATALOGUE: Readonly<Record<'si' | 'en', readonly CatalogueSong[]>> = {
  si: SINHALA_CATALOGUE,
  en: ENGLISH_CATALOGUE,
};

/** The full 12-entry catalogue for a language. Never returned to the frontend directly — see `selectThreeSongs`. */
export function getMusicCatalogue(language: 'si' | 'en'): readonly CatalogueSong[] {
  return CATALOGUE[language];
}

/**
 * Deterministic 3-of-N rotation. No randomness (§6 of the approved plan):
 * `turnIndex` (the conversation's prior message count) decides the start
 * position, so the same conversation state always yields the same 3 songs,
 * and a longer conversation cycles through the full catalogue rather than
 * always returning the first 3.
 *
 * Works for any catalogue length ≥ 3, not hardcoded to 12 — a future
 * catalogue-size change needs no change here.
 */
export function selectThreeSongs(catalogue: readonly CatalogueSong[], turnIndex: number): ThreeSongs {
  const n = catalogue.length;
  if (n < 3) {
    throw new Error(`selectThreeSongs: catalogue has ${n} entries, need at least 3`);
  }
  // Guard against a negative turnIndex ever producing a negative modulo.
  const start = ((turnIndex % n) + n) % n;
  const a = catalogue[start]!;
  const b = catalogue[(start + 1) % n]!;
  const c = catalogue[(start + 2) % n]!;
  return [a, b, c];
}
