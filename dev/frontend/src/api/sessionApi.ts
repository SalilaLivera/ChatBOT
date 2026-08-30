import { config } from "../config";
import { sessionId } from "../session";
import { useAppStore } from "../store";
import type { MoodState, Modality } from "./contracts";

export type MoodAnalyseResponse = {
  state: MoodState;
  confidence: number;
  modalities_used: Modality[];
  fusion_version: string;
};

function authHeaders(): Record<string, string> {
  const token = useAppStore.getState().accessToken;
  if (!token) throw new Error("No access token: cannot call the backend before anonymous sign-in completes.");
  return { Authorization: `Bearer ${token}`, "x-session-id": sessionId };
}

export async function grantCameraConsent(): Promise<void> {
  const res = await fetch(`${config.apiBaseUrl}/api/v1/session/camera/consent`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ granted: true })
  });
  if (!res.ok) throw new Error(`camera consent request failed: ${res.status}`);
}

export async function setCameraActive(active: boolean): Promise<void> {
  const res = await fetch(`${config.apiBaseUrl}/api/v1/session/camera/state`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ active })
  });
  if (!res.ok) throw new Error(`camera state request failed: ${res.status}`);
}

export async function revokeCamera(): Promise<void> {
  const res = await fetch(`${config.apiBaseUrl}/api/v1/session/camera`, {
    method: "DELETE",
    headers: authHeaders()
  });
  if (!res.ok) throw new Error(`camera revoke request failed: ${res.status}`);
}

// Fire-and-forget by design (§3A.6): the response renders nothing, and
// {"accepted":false,...} for no-face/back-pressure/rate-limit is normal
// operation, not an error. Network failures are swallowed for the same
// reason -- there is nothing to surface to the user.
export function postFrame(blob: Blob): void {
  let headers: Record<string, string>;
  try {
    headers = authHeaders();
  } catch {
    return;
  }
  const form = new FormData();
  form.append("image", blob, "frame.jpg");
  fetch(`${config.apiBaseUrl}/api/v1/session/frame`, { method: "POST", headers, body: form }).catch(() => {});
}

export async function analyseMood(text: string): Promise<MoodAnalyseResponse> {
  const res = await fetch(`${config.apiBaseUrl}/api/v1/mood/analyse`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  });
  if (!res.ok) throw new Error(`mood analyse request failed: ${res.status}`);
  return (await res.json()) as MoodAnalyseResponse;
}
