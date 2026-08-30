export const config = {
  apiMode: process.env.EXPO_PUBLIC_API_MODE === "live" ? "live" : "mock",
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:3000",
  ferJpegQuality: Number(process.env.EXPO_PUBLIC_FER_JPEG_QUALITY ?? 90),
  ferSampleMs: Number(process.env.EXPO_PUBLIC_FER_SAMPLE_MS ?? 3000)
} as const;
