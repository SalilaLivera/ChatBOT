import { config } from "../config";

export type FaceBox = { x: number; y: number; width: number; height: number };
export type FaceCropPayload = { uri: string; width: number; height: number; mimeType: "image/jpeg" };
export interface FaceDetector { detect(frame: unknown): Promise<FaceBox | null>; }
export interface FaceCropEncoder { cropAndEncode(frame: unknown, box: FaceBox): Promise<FaceCropPayload>; }
export const visionConfig = { cropSize: config.ferCropSize, jpegQuality: config.ferJpegQuality, sampleMs: config.ferSampleMs };
// The app sends an ordinary RGB JPEG crop. It must not send tensors, grayscale pixels, or [-1, 1] values.
// Native camera/face detection is intentionally not enabled in the web demo; no raw frame is persisted.
