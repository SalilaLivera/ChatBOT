// A session is one page/app instance (MOOD_STATE_SPEC §3A.4): a fresh id per
// load, kept in memory only -- never localStorage/AsyncStorage, never reused
// across reloads or tabs.
function generateSessionId(): string {
  const cryptoObj: any = (globalThis as any).crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") return cryptoObj.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, char => {
    const r = (Math.random() * 16) | 0;
    const v = char === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const sessionId: string = generateSessionId();
