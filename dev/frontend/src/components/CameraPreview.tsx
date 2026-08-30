import { createElement, useEffect, useMemo, useRef } from "react";
import { Animated, PanResponder, Platform, StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "../theme";
import { WebCameraState } from "../vision/useWebCamera";
import { useBlazeFace } from "../vision/useBlazeFace";

const W = 140;
const H = 186;

// Live self-view. The <video>, the webcam stream and BlazeFace detection run as soon as the camera
// is on -- whether or not the panel is visible -- so opening the panel is instant. The tree is
// always the same shape (only the wrapper's style changes) so the <video> is never re-parented.
// Preview only: nothing is captured or transmitted. The panel can be dragged anywhere.
export function CameraPreview({ state, stream, visible }: { state: WebCameraState; stream: MediaStream | null; visible: boolean }) {
  const videoRef = useRef<any>(null);
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const dragOffset = useRef({ x: 0, y: 0 });
  const { face, video } = useBlazeFace(videoRef, state === "on");

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,
        onPanResponderGrant: () => {
          pan.setOffset({ ...dragOffset.current });
          pan.setValue({ x: 0, y: 0 });
        },
        onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
        onPanResponderRelease: (_e, g) => {
          dragOffset.current = { x: dragOffset.current.x + g.dx, y: dragOffset.current.y + g.dy };
          pan.flattenOffset();
        }
      }),
    [pan]
  );

  useEffect(() => {
    if (Platform.OS !== "web" || !videoRef.current) return;
    if (videoRef.current.srcObject !== (stream ?? null)) videoRef.current.srcObject = stream ?? null;
  }, [stream]);

  if (Platform.OS !== "web" || state === "idle") return null;

  const live = state === "on";
  const shown = visible && live;

  // Map the face box from video-pixel space onto the mirrored, cover-cropped preview.
  let boxStyle: { left: number; top: number; width: number; height: number } | null = null;
  if (shown && face && video && video.w && video.h) {
    const scale = Math.max(W / video.w, H / video.h);
    const cropX = (video.w * scale - W) / 2;
    const cropY = (video.h * scale - H) / 2;
    const left = face.x * scale - cropX;
    const top = face.y * scale - cropY;
    const width = face.w * scale;
    const height = face.h * scale;
    boxStyle = { left: W - (left + width), top, width, height }; // mirror X
  }

  return (
    <Animated.View
      {...(shown ? responder.panHandlers : {})}
      pointerEvents={shown ? "auto" : "none"}
      style={[
        styles.wrap,
        !shown && styles.hidden,
        shown && !live && styles.message,
        shown && ({ transform: [{ translateX: pan.x }, { translateY: pan.y }], cursor: "grab" } as any)
      ]}
    >
      {live &&
        createElement("video", {
          ref: videoRef,
          autoPlay: true,
          muted: true,
          playsInline: true,
          style: { width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)", pointerEvents: "none" }
        })}
      {shown && boxStyle && <View style={[styles.faceBox, boxStyle]} pointerEvents="none" />}
      {shown && live && <View style={styles.dot} />}
      {shown && !live && (
        <Text style={styles.messageText}>
          {state === "starting" ? "Starting camera…" : state === "denied" ? "Camera access blocked in your browser." : "No camera available."}
        </Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", right: 14, top: 84, width: W, height: H, borderRadius: 16, overflow: "hidden", backgroundColor: colors.ink, borderWidth: 1, borderColor: colors.border, zIndex: 8 },
  hidden: { width: 1, height: 1, right: -20, top: -20, opacity: 0, borderWidth: 0 },
  message: { alignItems: "center", justifyContent: "center", padding: 10, backgroundColor: colors.card },
  messageText: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, textAlign: "center" },
  dot: { position: "absolute", left: 8, top: 8, width: 9, height: 9, borderRadius: 5, backgroundColor: "#3FBF6A" },
  faceBox: { position: "absolute", borderWidth: 2, borderColor: "#3FBF6A", borderRadius: 6 }
});
