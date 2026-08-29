import { config } from "../config";
import { ChatApi, ChatResponse } from "./contracts";
import { MockChatApi, defaultScenario } from "./mock";

export function createChatApi(getScenario: () => typeof defaultScenario): ChatApi {
  if (config.apiMode === "mock") return new MockChatApi(getScenario);
  return { async sendMessage(request) { const response = await fetch(`${config.apiBaseUrl}/v1/chat/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) }); if (!response.ok) throw new Error(`Request failed: ${response.status}`); return (await response.json()) as ChatResponse; } };
}
