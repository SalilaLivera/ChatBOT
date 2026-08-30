/**
 * The ChatResponse contract, and the limits the LLM's output is held to.
 *
 * D-1 (owner, 2026-08-30): the existing frontend field `response: string` is
 * RENAMED to `message`, and optional `sections[]` is added, as ONE versioned
 * contract change. Both fields are NOT maintained in parallel — two fields
 * meaning nearly the same thing is how a frontend renders the wrong one.
 *
 * ⛔ WHAT THE LLM MAY AND MAY NOT PRODUCE
 *
 * The LLM produces `message` and `sections` — CONTENT ONLY.
 *
 * It does NOT produce, and must never be permitted to set:
 *   `response_mode`   - application-controlled (M6)
 *   `mood`            - application-controlled (M5 fusion)
 *   `content_suggestion` - application-controlled
 *   `message_id`, `session_id`, `language` - application-controlled
 *
 * That is why `LlmGeneratedContent` (what we parse from the model) and
 * `ChatResponse` (what we return) are DIFFERENT TYPES. The model's output is
 * assembled INTO a response by the backend; it never IS one. Collapsing these
 * two types would let a model field its way into an application-controlled slot.
 *
 * Plan: docs/plan/backend/LLM_INTEGRATION_PLAN.md §4, §12.
 */

/** Mirrors dev/frontend/src/api/contracts.ts. Application-controlled. */
export type Language = 'si' | 'en';
export type MoodState = 'calm' | 'neutral' | 'distressed' | 'unknown';
export type ResponseMode = 'normal' | 'supportive' | 'safety';
export type Modality = 'text' | 'face';

// ---------------------------------------------------------------------------
// Supportive content — therapeutic music and video
// ---------------------------------------------------------------------------

/**
 * ⛔ APPLICATION-CONTROLLED. THE LLM NEVER GENERATES ONE.
 *
 * Therapeutic music and video recommendations are a CORE feature of IT22638168,
 * not an optional extra: the original proposal identifies them as part of this
 * component, and FR-5 requires a music recommendation when the user is
 * significantly distressed. This type exists so that requirement survives the
 * LLM integration intact.
 *
 * THE SELECTION PATH — and the LLM is nowhere in it:
 *
 *     mood / adaptive response policy
 *              ↓
 *     approved content selector          ← app-owned, from a curated catalogue
 *              ↓
 *     content_suggestion                 ← this type
 *              ↓
 *     frontend                           ← owns all rendering and playback UI
 *
 * ⛔ WHAT THE LLM MAY AND MAY NOT DO
 *
 *   MAY: mention supportive content in prose, and explain why it might help —
 *        "some people find slow breathing or calm music helps at moments like
 *        this". That is ordinary conversational text.
 *
 *   MAY NOT: invent a URL, a media ID, a track or video title presented as a
 *        real item, an artist, a duration, or any recommendation metadata.
 *        `sanitise.ts` already destroys URLs in generated text, which closes
 *        the most dangerous half of this by construction.
 *
 * Every item a user can actually play comes from the approved catalogue and is
 * referenced by a STABLE ID. A hallucinated media reference in a distress
 * context is the same class of harm as a hallucinated medical URL.
 */
export type ContentSuggestionType =
  | 'breathing'
  | 'grounding'
  /** Generic audio. Retained from the existing frontend contract. */
  | 'audio'
  /** Therapeutic music — proposal requirement, FR-5. */
  | 'music'
  /** Supportive video — proposal requirement. */
  | 'video';

export interface ContentSuggestion {
  /** Stable catalogue ID. Never generated, never derived from model output. */
  readonly id: string;
  /** Display title, from the catalogue — not from the LLM. */
  readonly title: string;
  readonly type: ContentSuggestionType;
  /**
   * Whether this item may be saved locally for OFFLINE PLAYBACK.
   *
   * Preserves the proposal requirement that saved music is available offline.
   * A catalogue property, not a user or model choice — licensing may permit
   * streaming while forbidding local retention, and only the catalogue knows.
   */
  readonly offline_available?: boolean;
}

// ---------------------------------------------------------------------------
// ⛔ WHAT THE SUPPORTIVE-CONTENT PHASE STILL OWES — recorded, NOT invented here
// ---------------------------------------------------------------------------
//
// This file establishes the BOUNDARY only. None of the following is decided,
// and none of it may be filled in by inference from this type:
//
//   1. THE CATALOGUE ITSELF — approved, licensed, culturally appropriate
//      Sinhala/English tracks and videos with stable IDs and metadata. Licensing
//      and cultural appropriateness are not engineering judgements.
//
//   2. THE SELECTION ALGORITHM — how mood maps to a suggestion. Deliberately not
//      invented. It sits downstream of M6, which does not exist either, and it
//      would introduce parameters requiring measurement.
//
//   3. THE FR-5 TRIGGER — what "significantly distressed" means operationally.
//      That is a threshold on a fused mood signal, and every such threshold in
//      this project is [FUTURE-EXPERIMENTAL] pending Phase 7.
//
//   4. OFFLINE STORAGE MECHANICS — what is cached, for how long, and how it is
//      purged on session revocation. Note O-15: purge-on-revocation is currently
//      in-memory only, and cached media is state at rest.
//
//   5. ⛔ NO THERAPEUTIC OR MEDICAL CLAIM may be made about any item. The system
//      is a supportive component, not a clinical instrument (FR-17,
//      SAFETY_POLICY §0). "Some people find this calming" is supportable;
//      "this reduces anxiety" is not.
//
// Until a catalogue exists, `content_suggestion` stays `null`. It is NOT
// populated with a placeholder — an invented item is worse than none.

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/**
 * Caps on generated structure.
 *
 * These are BOUNDS, not tuning parameters — they exist to keep a runaway
 * generation from producing an unrenderable response, and overflow is
 * TRUNCATED rather than rejected (plan §4.1). A response that is slightly too
 * long is still useful to the user; a rejected one is not.
 */
export const MAX_SECTIONS = 6;
export const MAX_SECTION_TITLE_CHARS = 80;

/**
 * Character caps. Generous — they are a runaway guard, not a style rule.
 * A model that emits 20 KB of text has malfunctioned.
 */
export const MAX_MESSAGE_CHARS = 4000;
export const MAX_SECTION_CONTENT_CHARS = 4000;

// ---------------------------------------------------------------------------
// What the LLM produces
// ---------------------------------------------------------------------------

export interface GeneratedSection {
  /** PLAIN TEXT ONLY — never markdown. The frontend styles it as a heading. */
  readonly title: string;
  /** Restricted markdown (see sanitise.ts). */
  readonly content: string;
}

/**
 * Exactly what is parsed out of the model's output — nothing more.
 *
 * `sections` is OPTIONAL by design (D-1). A short emotional reply must not be
 * forced into topics and subtopics. Absent, `[]`, and populated are all valid,
 * and the frontend renders `message` in every case.
 */
export interface LlmGeneratedContent {
  readonly message: string;
  readonly sections?: readonly GeneratedSection[];
}

// ---------------------------------------------------------------------------
// Music recommendation (app-owned, static catalogue — see
// src/content/musicCatalogue.ts, src/music/musicOffer.ts)
// ---------------------------------------------------------------------------

/**
 * ⛔ APPLICATION-CONTROLLED, SAME AS `ContentSuggestion` ABOVE. The LLM never
 * produces this, never sees the catalogue, and never selects a song — the
 * trigger (`shouldOfferMusic`), the catalogue, and the selection all live in
 * `src/music/` and `src/content/`, entirely outside `src/llm/`. This type
 * exists purely to describe what the ROUTE attaches to a response; it is
 * never part of `LlmGeneratedContent` and never passed to a provider.
 *
 * Deliberately a SIBLING field to `content_suggestion`, not a reuse of it —
 * `ContentSuggestion` describes exactly one generic item; a music offer is
 * always exactly 3 songs, a different shape for a different purpose.
 *
 * `language` is NOT included per song here — the wire shape only needs
 * `id`/`title`/`artist`/`url`; which catalogue it came from is implied by
 * having been selected at all, not something the frontend branches on.
 */
export interface MusicOfferSong {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly url: string;
}

/** Always exactly 3 — enforced at compile time, not by convention. */
export interface MusicOffer {
  readonly songs: readonly [MusicOfferSong, MusicOfferSong, MusicOfferSong];
}

// ---------------------------------------------------------------------------
// What the backend returns
// ---------------------------------------------------------------------------

/** The full response. Only `message` and `sections` originate from the model. */
export interface ChatResponse {
  readonly message_id: string;
  readonly session_id: string;

  /** From the LLM, sanitised. Always present and non-empty. */
  readonly message: string;
  /** From the LLM, sanitised. Optional — omitted entirely when there are none. */
  readonly sections?: readonly GeneratedSection[];

  readonly language: Language;
  readonly response_mode: ResponseMode;
  readonly content_suggestion: ContentSuggestion | null;
  readonly mood: {
    readonly state: MoodState;
    readonly modalities_used: readonly Modality[];
  };
  /**
   * `null` unless `shouldOfferMusic(state, confidence)` was true for THIS
   * turn's fused mood result. Never inferred by the frontend, never
   * generated by the LLM — see `src/music/musicOffer.ts`.
   */
  readonly music_offer: MusicOffer | null;
}

/**
 * The JSON schema description handed to the model.
 *
 * Kept next to the types it describes so the two cannot drift. It names ONLY
 * the two generated fields — the model is never shown the application-controlled
 * ones, because a model that knows a field exists will eventually try to fill it.
 */
export const GENERATED_CONTENT_SCHEMA_DESCRIPTION = `{
  "message": "string — required, non-empty, the conversational reply",
  "sections": [            // OPTIONAL — omit entirely for a short conversational reply
    {
      "title":   "string — plain text, no markdown, max ${MAX_SECTION_TITLE_CHARS} chars",
      "content": "string — restricted markdown"
    }
  ]
}`;
