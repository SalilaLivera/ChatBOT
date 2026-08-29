import { create } from "zustand";
import { ChatResponse, MoodState, ResponseMode } from "./api/contracts";
import { defaultScenario, MockScenario } from "./api/mock";

export type Message = { id: string; role: "user" | "assistant"; text: string; response?: ChatResponse };
type AppState = { language: "en" | "si"; authenticated: boolean; cameraEnabled: boolean; consentSeen: boolean; messages: Message[]; scenario: MockScenario; setLanguage: (language: "en" | "si") => void; signIn: () => void; signOut: () => void; setCamera: (enabled: boolean) => void; setConsentSeen: (seen: boolean) => void; addMessage: (message: Message) => void; newChat: () => void; setScenario: (change: Partial<MockScenario>) => void };
export const useAppStore = create<AppState>((set) => ({ language: "en", authenticated: false, cameraEnabled: false, consentSeen: false, messages: [], scenario: defaultScenario, setLanguage: language => set({ language }), signIn: () => set({ authenticated: true }), signOut: () => set({ authenticated: false, messages: [], cameraEnabled: false }), setCamera: cameraEnabled => set({ cameraEnabled }), setConsentSeen: consentSeen => set({ consentSeen }), addMessage: message => set(state => ({ messages: [...state.messages, message] })), newChat: () => set({ messages: [] }), setScenario: change => set(state => ({ scenario: { ...state.scenario, ...change } })) }));
export const moodLabels: Record<MoodState, string> = { calm: "Calm", neutral: "Neutral", distressed: "Here with you", unknown: "Listening" };
export const responseLabels: Record<ResponseMode, string> = { normal: "Normal", supportive: "Supportive", safety: "Safety" };
