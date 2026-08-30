export type Language = "si" | "en";
export type MoodState = "calm" | "neutral" | "distressed" | "unknown";
export type ResponseMode = "normal" | "supportive" | "safety";
export type Modality = "text" | "face";
export type ContentSuggestion = { id: string; title: string; type: "breathing" | "audio" | "grounding" };
// Music recommendation catalogue entry, backend-owned. The frontend never
// constructs, translates, or validates `url` -- it is trusted, approved
// application data (see MusicOfferModal.tsx).
export type MusicSong = { id: string; title: string; url: string };
export type MusicOffer = { songs: MusicSong[] };
export type ChatRequest = { session_id: string; text: string; ui_language: Language };
export type ChatResponse = {
  message_id: string;
  session_id: string;
  response: string;
  language: Language;
  response_mode: ResponseMode;
  content_suggestion: ContentSuggestion | null;
  mood: { state: MoodState; modalities_used: Modality[] };
  // Present only when the backend's distress/language/catalogue decision
  // (owned entirely server-side) produces an offer. `null`/absent => no CTA.
  music_offer: MusicOffer | null;
};
// ⛔ I1-B SCAFFOLDING ONLY -- the response shape of the temporary
// POST /api/v1/conversations/:id/messages reply path. This is NOT D-1's
// `ChatResponse` and must never be adopted as the permanent contract:
// `response_mode` is always `null` (B-1/M6/M8 unresolved) and `mood_debug`
// is a dev-only diagnostic, distinct from D-1's `mood` field.
//
// `music_offer` is likewise provisional here: as of this change the backend
// route (conversations.routes.ts) does not yet emit this field at all -- it
// is declared ahead of the backend landing it, optional/nullable, so the
// adapter in client.ts and the frontend render path are null-safe today and
// pick the real value up the moment the backend adds it. Do not assume this
// shape is final; re-check against the actual backend payload once it ships.
export type ProvisionalChatReplyI1B = {
  id: string;
  role: "assistant";
  created_at: string;
  content: string;
  mood_debug: { state: MoodState; confidence: number; modalities_used: Modality[]; language_detected: string };
  response_mode: null;
  music_offer?: MusicOffer | null;
};
export type ApiErrorKind = "NetworkError" | "TimeoutError" | "AuthError" | "ValidationError" | "ServerError" | "ContractMismatchError" | "RateLimitError";
export class ApiError extends Error { constructor(public kind: ApiErrorKind, message: string) { super(message); } }
export interface ChatApi { sendMessage(request: ChatRequest): Promise<ChatResponse>; }
