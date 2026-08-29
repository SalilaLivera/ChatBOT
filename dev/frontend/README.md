# Maathru Care frontend

Cross-platform React Native / Expo SDK 54 foundation for the Maathru Care maternal-support experience.

## Run the web demo

```bash
npm install
npm run web
```

The default mode is mock mode. Copy `.env.example` to `.env` to change configuration. The demo sign-in accepts any values; Supabase Auth is used automatically when public Supabase configuration is supplied.

## Demo controls

Open the `Demo` control on the conversation screen to force `CALM`, `NEUTRAL`, `DISTRESSED`, or `UNKNOWN` mood states, normal/supportive/safety responses, content suggestions, and a failed request. Camera consent is optional and the web UI only exposes the future sensing state; native face detection and crop transport are not implemented yet.

## Boundaries

UI components never call `fetch` directly. `src/api/contracts.ts` is the response contract, `src/api/client.ts` selects mock/live implementations, and `src/vision/contracts.ts` defines the future native pipeline. No model probabilities, fusion logic, safety heuristics, raw camera frames, or service credentials belong in this app.
