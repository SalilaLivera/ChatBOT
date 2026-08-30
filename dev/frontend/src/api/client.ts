import { config } from "../config";
import { ChatApi, ChatResponse, ProvisionalChatReplyI1B } from "./contracts";
import { MockChatApi, defaultScenario } from "./mock";
import { useAppStore } from "../store";

function authHeaders(): Record<string, string> {
  const token = useAppStore.getState().accessToken;
  if (!token) throw new Error("No access token: cannot call the backend before anonymous sign-in completes.");
  return { Authorization: `Bearer ${token}` };
}

// ⛔ I1-B SCAFFOLDING -- one conversation id per app session, created lazily
// on first send and reused for the rest of the session's lifetime. This is
// glue for the provisional reply path only, not a permanent session model.
let conversationId: string | null = null;
async function getOrCreateConversationId(): Promise<string> {
  if (conversationId) return conversationId;
  const res = await fetch(`${config.apiBaseUrl}/api/v1/conversations`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" }
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  const body = (await res.json()) as { id: string };
  conversationId = body.id;
  return conversationId;
}

export function createChatApi(getScenario: () => typeof defaultScenario): ChatApi {
  if (config.apiMode === "mock") return new MockChatApi(getScenario);
  return {
    async sendMessage(request) {
      const id = await getOrCreateConversationId();
      // ⛔ FIXED (post-manual-verification) -- this call never sent
      // x-session-id, so the backend's mood_debug was silently text-only
      // regardless of camera state: confirmed live by sending the same
      // message with a detected, tracked face and getting the byte-identical
      // confidence as with the camera off. `request.session_id` is the same
      // per-app-load id every other authenticated call already sends.
      const res = await fetch(`${config.apiBaseUrl}/api/v1/conversations/${id}/messages`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json", "x-session-id": request.session_id },
        body: JSON.stringify({ content: request.text })
      });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const reply = (await res.json()) as ProvisionalChatReplyI1B;
      // Adapted at the call site (not a rename of ChatResponse -- see
      // contracts.ts). ⛔ `response_mode` is left as the backend's real
      // `null` -- B-1 (M6/M8) is unresolved, so no real mode is guessed. The
      // cast is needed only because `ChatResponse.response_mode` has no
      // `null` arm yet (D-1 was never asked to account for this scaffolding
      // path); nothing here invents a `normal`/`supportive`/`safety` value.
      // `content_suggestion` has no real value yet either. `mood` mirrors the
      // dev-only `mood_debug` field, not a real fused-modality signal.
      const adapted = {
        message_id: reply.id,
        session_id: request.session_id,
        response: reply.content,
        language: request.ui_language,
        response_mode: reply.response_mode,
        content_suggestion: null,
        mood: { state: reply.mood_debug.state, modalities_used: reply.mood_debug.modalities_used }
      } as unknown as ChatResponse;
      return adapted;
    }
  };
}
