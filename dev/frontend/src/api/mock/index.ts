import { ChatApi, ChatRequest, ChatResponse, MoodState, ResponseMode } from "../contracts";
import { ApiError } from "../contracts";

export type MockScenario = { mood: MoodState; responseMode: ResponseMode; failure: boolean; suggestion: boolean };
export const defaultScenario: MockScenario = { mood: "neutral", responseMode: "normal", failure: false, suggestion: true };
export class MockChatApi implements ChatApi {
  constructor(private getScenario: () => MockScenario) {}
  async sendMessage(request: ChatRequest): Promise<ChatResponse> {
    await new Promise(resolve => setTimeout(resolve, 650));
    const scenario = this.getScenario();
    if (scenario.failure) throw new ApiError("NetworkError", "Mock network failure");
    const si = request.ui_language === "si";
    const responses = scenario.responseMode === "safety"
      ? (si ? "ඔබ මෙය තනිවම දරාගත යුතු නැත. ඔබ විශ්වාස කරන කෙනෙකුට දැන්ම කතා කිරීමට හැකිද?" : "You do not have to carry this alone. Could you contact someone you trust right now?")
      : scenario.responseMode === "supportive"
        ? (si ? "ඔබට මෙය බරක් ලෙස දැනෙන බව මට ඇසේ. අපි මෙය එක කුඩා පියවරක් ලෙස ගනිමු." : "I hear that this feels heavy. Let’s take it one small step at a time.")
        : (si ? "ඔබ බෙදාගත් දේට ස්තුතියි. මම ඔබ සමඟ සිටිමි." : "Thank you for sharing that. I’m here with you.");
    return { message_id: `mock-${Date.now()}`, session_id: request.session_id, response: responses, language: request.ui_language, response_mode: scenario.responseMode, content_suggestion: scenario.suggestion ? { id: "breath-1", title: si ? "හුස්ම ගැනීමේ විරාමයක්" : "A gentle breathing pause", type: "breathing" } : null, mood: { state: scenario.mood, modalities_used: scenario.mood === "unknown" ? [] : ["text"] } };
  }
}
