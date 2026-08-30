// Native stub -- BlazeFace face detection runs on web only (see useBlazeFace.web.ts).
export type FacePixelBox = { x: number; y: number; w: number; h: number };
export type BlazeFaceResult = { face: FacePixelBox | null; video: { w: number; h: number } | null; ready: boolean };

export function preloadBlazeFace() {}

export function useBlazeFace(_videoRef: { current: any }, _active: boolean): BlazeFaceResult {
  return { face: null, video: null, ready: false };
}
