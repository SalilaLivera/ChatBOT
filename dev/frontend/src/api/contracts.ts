export type Language = "si" | "en";
export type MoodState = "calm" | "neutral" | "distressed" | "unknown";
export type ResponseMode = "normal" | "supportive" | "safety";
export type Modality = "text" | "face";
export type ContentSuggestion = { id: string; title: string; type: "breathing" | "audio" | "grounding" };
export type ChatRequest = { session_id: string; text: string; ui_language: Language };
export type ChatResponse = { message_id: string; session_id: string; response: string; language: Language; response_mode: ResponseMode; content_suggestion: ContentSuggestion | null; mood: { state: MoodState; modalities_used: Modality[] } };
export type ApiErrorKind = "NetworkError" | "TimeoutError" | "AuthError" | "ValidationError" | "ServerError" | "ContractMismatchError" | "RateLimitError";
export class ApiError extends Error { constructor(public kind: ApiErrorKind, message: string) { super(message); } }
export interface ChatApi { sendMessage(request: ChatRequest): Promise<ChatResponse>; }
