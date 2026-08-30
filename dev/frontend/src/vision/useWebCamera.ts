import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

export type WebCameraState = "idle" | "starting" | "on" | "denied" | "unavailable";

// Web-only: when `enabled` turns true we actually acquire the browser webcam via getUserMedia
// (this is what shows the permission prompt and the "camera in use" indicator). The stream is a
// live preview only -- no frame is captured, encoded, or sent anywhere. Tracks are stopped the
// moment the camera is turned off or the screen unmounts. On native this is a no-op for now.
export function useWebCamera(enabled: boolean) {
  const [state, setState] = useState<WebCameraState>("idle");
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;

    const stop = () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };

    if (!enabled) {
      stop();
      setState("idle");
      return;
    }
    if (!md || !md.getUserMedia) {
      setState("unavailable");
      return;
    }

    let cancelled = false;
    setState("starting");
    md.getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then(stream => {
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        setState("on");
      })
      .catch(() => {
        if (!cancelled) setState("denied");
      });

    return () => {
      cancelled = true;
      stop();
    };
  }, [enabled]);

  return { state, stream: streamRef.current };
}
