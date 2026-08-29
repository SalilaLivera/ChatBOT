export const config = {
  apiMode: process.env.EXPO_PUBLIC_API_MODE === "live" ? "live" : "mock",
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:4000",
  ferCropSize: Number(process.env.EXPO_PUBLIC_FER_CROP_SIZE ?? 96),
  ferJpegQuality: Number(process.env.EXPO_PUBLIC_FER_JPEG_QUALITY ?? 90),
  ferSampleMs: Number(process.env.EXPO_PUBLIC_FER_SAMPLE_MS ?? 3000)
} as const;
