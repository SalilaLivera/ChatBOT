import { useEffect, useRef, useState } from "react";
// @ts-ignore -- types ship with the package once installed (npm install)
import * as blazeface from "@tensorflow-models/blazeface";
// @ts-ignore
import "@tensorflow/tfjs";
import { config } from "../config";

export type FacePixelBox = { x: number; y: number; w: number; h: number };
export type BlazeFaceResult = { face: FacePixelBox | null; video: { w: number; h: number } | null; ready: boolean };

let modelPromise: Promise<any> | null = null;
const loadModel = (): Promise<any> => (modelPromise ??= blazeface.load());

// Call early (e.g. as soon as consent is given) so the model + TF backend are warm before the
// user ever opens the preview -- then showing it is instant.
export function preloadBlazeFace() {
  loadModel().catch(() => { modelPromise = null; });
}

// Loads BlazeFace once and runs estimateFaces on the live <video> at ~config.ferSampleMs cadence
// (defaults to 5 FPS). Returns the first face's box in the video's own pixel space, plus the
// video's intrinsic size so the caller can map it onto the displayed (mirrored, cover-cropped)
// preview. No pixels leave the browser.
export function useBlazeFace(videoRef: { current: any }, active: boolean): BlazeFaceResult {
  const [face, setFace] = useState<FacePixelBox | null>(null);
  const [video, setVideo] = useState<{ w: number; h: number } | null>(null);
  const [ready, setReady] = useState(false);
  const modelRef = useRef<any>(null);

  useEffect(() => {
    if (!active) {
      setFace(null);
      setVideo(null);
      return;
    }
    let stopped = false;
    let timer: any;

    loadModel().then((model: any) => {
      if (stopped) return;
      modelRef.current = model;
      setReady(true);
      tick();
    });

    async function tick() {
      const el = videoRef.current;
      const model = modelRef.current;
      if (!stopped && model && el && el.readyState >= 2 && el.videoWidth) {
        try {
          const preds: any[] = await model.estimateFaces(el, false);
          if (!stopped) {
            setVideo({ w: el.videoWidth, h: el.videoHeight });
            // Multiple detected faces -> skip (§4, settled): do not pick one.
            // No BlazeFace-confidence selection policy either -- exactly one
            // detection is required to produce a face box.
            if (preds.length === 1) {
              const [x1, y1] = preds[0].topLeft as [number, number];
              const [x2, y2] = preds[0].bottomRight as [number, number];
              setFace({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
            } else {
              setFace(null);
            }
          }
        } catch {
          /* transient decode error -- skip this frame */
        }
      }
      if (!stopped) timer = setTimeout(tick, Math.max(120, config.ferSampleMs));
    }

    return () => {
      stopped = true;
      clearTimeout(timer);
      setFace(null);
    };
  }, [active, videoRef]);

  return { face, video, ready };
}
