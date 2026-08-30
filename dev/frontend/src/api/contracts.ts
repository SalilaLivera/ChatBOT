export type Language = "si" | "en";
export type MoodState = "calm" | "neutral" | "distressed" | "unknown";
export type ResponseMode = "normal" | "supportive" | "safety";
export type Modality = "text" | "face";
export type ContentSuggestion = { id: string; title: string; type: "breathing" | "audio" | "grounding" };
export type ChatRequest = { session_id: string; text: string; ui_language: Language };
export type ChatResponse = { message_id: string; session_id: string; response: string; language: Language; response_mode: ResponseMode; content_suggestion: ContentSuggestion | null; mood: { state: MoodState; modalities_used: Modality[] } };
// ⛔ I1-B SCAFFOLDING ONLY -- the response shape of the temporary
// POST /api/v1/conversations/:id/messages reply path. This is NOT D-1's
// `ChatResponse` and must never be adopted as the permanent contract:
// `response_mode` is always `null` (B-1/M6/M8 unresolved) and `mood_debug`
// is a dev-only diagnostic, distinct from D-1's `mood` field.
export type ProvisionalChatReplyI1B = {
  id: string;
  role: "assistant";
  created_at: string;
  content: string;
  mood_debug: { state: MoodState; confidence: number; modalities_used: Modality[]; language_detected: string };
  response_mode: null;
};
export type ApiErrorKind = "NetworkError" | "TimeoutError" | "AuthError" | "ValidationError" | "ServerError" | "ContractMismatchError" | "RateLimitError";
export class ApiError extends Error { constructor(public kind: ApiErrorKind, message: string) { super(message); } }
export interface ChatApi { sendMessage(request: ChatRequest): Promise<ChatResponse>; }
