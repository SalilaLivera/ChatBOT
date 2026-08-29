import { useLocalSearchParams } from "expo-router";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, findNodeHandle, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { MessageBubble } from "@/components/MessageBubble";
import { DevPanel } from "@/components/DevPanel";
import { colors, fonts, spacing, type } from "@/theme";
import { i18n } from "@/i18n";
import { useAppStore } from "@/store";
import { createChatApi } from "@/api/client";
export default function Chat() {
  const { consent } = useLocalSearchParams<{ consent?: string }>();
  const { language, messages, addMessage, newChat, cameraEnabled, consentSeen, setConsentSeen } = useAppStore();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(false);
  const [focused, setFocused] = useState(false);
  const [composerW, setComposerW] = useState(320);
  const composerRef = useRef<any>(null);
  const [autoH, setAutoH] = useState(0);
  const [dynamicMode, setDynamicMode] = useState(false);
  const [showDev, setShowDev] = useState(false);
  const [showConsent, setShowConsent] = useState(consent === "1" && !consentSeen);
  const api = useMemo(() => createChatApi(() => useAppStore.getState().scenario), []);
  // Raised = the resting mid-screen position shown before the user engages the composer.
  const raised = messages.length === 0 && !focused;
  // The idle line reserves room on the right for the send button; the moment the text fills it, the
  // field goes full width and grows one real line at a time (max 6), then scrolls. The text size
  // steps down 16 -> 15 once it reaches the 4th line. A rough char-width estimate decides the idle
  // flip and the compact step; the actual pixel height is measured from the DOM (below).
  const MAX_LINES = 6;
  const singleLineBox = 40;
  const estLines = draft.split("\n").reduce((n, s) => n + Math.max(1, Math.ceil(s.length / Math.max(6, Math.floor((composerW - 24) / 11)))), 0);
  // Idle -> dynamic is decided by real measurement (in the effect): stay on one centred line until
  // the text actually reaches the end of the idle area and wraps, then flip. Coming back to idle
  // only when the text is short enough to certainly fit one line again (no flip/unflip loop).
  const singleLine = draft.length === 0 || (!dynamicMode && !draft.includes("\n"));
  const lineHeight = 22;
  const rawLines = autoH ? Math.max(1, Math.round(autoH / lineHeight)) : estLines;
  // Use the length-based estimate (monotonic with input) for the size step so it can't oscillate
  // when the smaller font reflows the text back under the threshold.
  const compact = !singleLine && estLines >= 4;
  const multiline = !singleLine;
  const cap = MAX_LINES * lineHeight + 14;
  const lineCount = Math.min(MAX_LINES, Math.max(1, singleLine ? 1 : rawLines));
  const atCap = !singleLine && rawLines >= MAX_LINES;
  const textHeight = singleLine ? singleLineBox : Math.min(cap, Math.max(autoH, lineCount * lineHeight) + 8);
  const effectiveLineHeight = singleLine ? singleLineBox : lineHeight;
  // Measure the textarea's true wrapped content height from the DOM (RNW's onContentSizeChange is
  // unreliable here). Reach the <textarea> via the composer div, collapse it to nothing, read
  // scrollHeight, restore. Re-runs whenever the mode or line metrics change.
  useLayoutEffect(() => {
    const host: any = composerRef.current;
    const node: any = host && (host.querySelector ? host : findNodeHandle(host));
    const ta: HTMLTextAreaElement | undefined = node && node.querySelector ? node.querySelector("textarea") : undefined;
    if (!ta || typeof ta.scrollHeight !== "number") return;
    const pRows = ta.rows, pH = ta.style.height, pPR = ta.style.paddingRight, pLH = ta.style.lineHeight;
    ta.rows = 1;
    // content height in the current mode -> drives the growing box
    ta.style.height = "0px";
    const sh = ta.scrollHeight;
    // hypothetical idle height: narrow (send button reserved on the right) + idle line-box. This is
    // the single source of truth for the flip, measured the same way in either mode -> no loop.
    ta.style.paddingRight = "52px";
    ta.style.lineHeight = singleLineBox + "px";
    ta.style.height = "0px";
    const idleSh = ta.scrollHeight;
    ta.rows = pRows || 1; ta.style.height = pH; ta.style.paddingRight = pPR; ta.style.lineHeight = pLH;
    if (sh && Math.abs(sh - autoH) > 1) setAutoH(sh);
    const wrapsIdle = draft.includes("\n") || idleSh > singleLineBox + 14;
    if (wrapsIdle !== dynamicMode) setDynamicMode(wrapsIdle);
  }, [draft, composerW, dynamicMode, effectiveLineHeight, compact]);
  const fade = useRef(new Animated.Value(1)).current;
  const dock = useRef(new Animated.Value(1)).current;
  useEffect(() => { Animated.timing(fade, { toValue: focused ? 0 : 1, duration: 160, useNativeDriver: true }).start(); }, [focused]);
  useEffect(() => { Animated.timing(dock, { toValue: raised ? 1 : 0, duration: 240, useNativeDriver: true }).start(); }, [raised]);
  const translateY = dock.interpolate({ inputRange: [0, 1], outputRange: [0, -230] });
  i18n.locale = language;
  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft(""); setError(false);
    addMessage({ id: `u-${Date.now()}`, role: "user", text });
    setSending(true);
    try {
      const response = await api.sendMessage({ session_id: "demo-session", text, ui_language: language });
      addMessage({ id: response.message_id, role: "assistant", text: response.response, response });
    } catch { setError(true); } finally { setSending(false); }
  }
  function closeConsent(enable: boolean) {
    setConsentSeen(true); setShowConsent(false);
    if (enable) useAppStore.getState().setCamera(true);
  }
  return <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <Screen>
      <View style={styles.headerBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="New chat" onPress={newChat} style={({ pressed }) => [styles.newChatButton, pressed && styles.newChatButtonPressed]}><Ionicons name="add" size={26} color={colors.deepPink} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={cameraEnabled ? i18n.t("disableCamera") : i18n.t("enableCamera")} onPress={() => useAppStore.getState().setCamera(!cameraEnabled)} style={[styles.cameraButton, !cameraEnabled && styles.cameraButtonOff]}><Ionicons name={cameraEnabled ? "videocam" : "videocam-off"} size={20} color={cameraEnabled ? colors.white : colors.muted} /></Pressable>
      </View>
      {showDev && <DevPanel />}
      {messages.length === 0
        ? <Animated.View style={[styles.empty, { opacity: fade }]} pointerEvents="none"><Text style={styles.sun}>✦</Text><Text style={styles.emptyTitle}>{i18n.t("emptyTitle")}</Text><Text style={styles.emptyBody}>{i18n.t("emptyBody")}</Text></Animated.View>
        : <View style={styles.messages}>{messages.map(message => <MessageBubble key={message.id} message={message} />)}</View>}
      {sending && <View style={styles.loading}><ActivityIndicator color={colors.deepPink} /><Text style={styles.loadingText}>Listening…</Text></View>}
      {error && <View style={styles.error}><Text style={styles.errorText}>{i18n.t("error")}</Text><Pressable onPress={() => { setError(false); setDraft("Please try again"); }}><Text style={styles.retry}>{i18n.t("retry")}</Text></Pressable></View>}
    </Screen>
    <Animated.View style={[styles.composerDock, { transform: [{ translateY }] }]}>
      <View ref={composerRef} style={[styles.composer, multiline && styles.composerMultiline]} onLayout={e => { const w = e.nativeEvent.layout.width; if (w > 150) setComposerW(w); }}>
        <TextInput
          multiline
          accessibilityLabel={i18n.t("placeholder")}
          value={draft}
          onChangeText={setDraft}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={i18n.t("placeholder")}
          placeholderTextColor="#B59EA7"
          blurOnSubmit={false}
          scrollEnabled={atCap}
          style={[styles.input, compact && styles.inputCompact, { height: textHeight, lineHeight: effectiveLineHeight, paddingRight: multiline ? 14 : 52 }]}
        />
        <Pressable accessibilityRole="button" accessibilityLabel={i18n.t("send")} onPress={send} style={styles.send}><Ionicons name="search" size={20} color={colors.white} /></Pressable>
      </View>
    </Animated.View>
    <Modal transparent visible={showConsent} animationType="none" onRequestClose={() => closeConsent(false)}>
      <View style={styles.modalRoot}>
        <BlurView intensity={28} tint="light" style={StyleSheet.absoluteFill} />
        <View style={styles.scrim} />
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}><View style={styles.modalIcon}><Text style={styles.modalIconText}>♡</Text></View><Text style={styles.modalTitle}>{i18n.t("consentTitle")}</Text></View>
          <Text style={styles.modalBody}>{i18n.t("consentBody")}</Text>
          <Pressable style={styles.modalPrimary} onPress={() => closeConsent(true)}><Text style={styles.modalPrimaryText}>{i18n.t("consentAccept")}</Text></Pressable>
          <Pressable style={styles.modalSecondary} onPress={() => closeConsent(false)}><Text style={styles.modalSecondaryText}>{i18n.t("keepOff")}</Text></Pressable>
        </View>
      </View>
    </Modal>
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.paper },
  headerBar: { height: 72, marginTop: -spacing.xl, marginHorizontal: -spacing.lg, paddingHorizontal: spacing.lg, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.card, shadowColor: colors.primary, shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2, zIndex: 2, boxShadow: "0 3px 8px rgba(217,108,138,.08)" as any },
  newChatButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: "transparent", alignItems: "center", justifyContent: "center", borderWidth: 2.5, borderColor: colors.deepPink, outlineStyle: "none" as any },
  newChatButtonPressed: { backgroundColor: colors.lightPink },
  cameraButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.deepPink, alignItems: "center", justifyContent: "center", borderWidth: 0, shadowOpacity: 0, elevation: 0, outlineStyle: "none" as any },
  cameraButtonOff: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  empty: { alignItems: "center", paddingVertical: 70, paddingHorizontal: spacing.lg },
  sun: { color: colors.deepPink, fontSize: 34, marginBottom: 16 },
  emptyTitle: { color: colors.ink, fontFamily: fonts.extraBold, fontSize: 22, textAlign: "center" },
  emptyBody: { color: colors.muted, fontFamily: fonts.regular, fontSize: type.body, textAlign: "center", lineHeight: 25, marginTop: 10, maxWidth: 360 },
  messages: { marginTop: spacing.lg },
  loading: { flexDirection: "row", gap: 9, alignItems: "center", padding: 10 },
  loadingText: { color: colors.muted, fontFamily: fonts.regular },
  error: { backgroundColor: "#F8EAE5", borderRadius: 12, padding: 12, flexDirection: "row", justifyContent: "space-between", marginVertical: 8 },
  errorText: { color: colors.ink, fontFamily: fonts.regular },
  retry: { color: colors.deepPink, fontFamily: fonts.bold },
  composerDock: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", paddingHorizontal: spacing.lg, paddingBottom: 16, zIndex: 5 },
  composer: { width: "100%", maxWidth: 828, minHeight: 58, justifyContent: "center", backgroundColor: colors.card, borderRadius: 26, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 8, shadowColor: colors.primary, shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, elevation: 3, boxShadow: "0 0 16px rgba(217,108,138,.14)" as any },
  composerMultiline: { justifyContent: "flex-start", paddingTop: 12, paddingBottom: 52 },
  inputCompact: { fontSize: 15 },
  input: { width: "100%", color: colors.ink, fontFamily: fonts.regular, fontSize: type.body, lineHeight: 22, paddingLeft: 12, paddingRight: 52, paddingVertical: 0, textAlignVertical: "top", outlineStyle: "none" as any },
  send: { position: "absolute", right: 7, bottom: 7, width: 44, height: 44, borderRadius: 22, backgroundColor: colors.deepPink, alignItems: "center", justifyContent: "center" },
  modalRoot: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(48,39,42,.16)" },
  modalCard: { width: "100%", maxWidth: 420, minHeight: 270, backgroundColor: colors.card, borderRadius: 26, padding: spacing.lg, shadowColor: colors.ink, shadowOpacity: .18, shadowRadius: 24, elevation: 8 },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 13 },
  modalIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.lightPink, alignItems: "center", justifyContent: "center" },
  modalIconText: { color: colors.deepPink, fontSize: 25 },
  modalTitle: { color: colors.ink, fontFamily: fonts.extraBold, fontSize: 21, flex: 1 },
  modalBody: { color: colors.muted, fontFamily: fonts.regular, fontSize: type.body, lineHeight: 24, marginTop: 14 },
  modalPrimary: { minHeight: 50, backgroundColor: colors.deepPink, borderRadius: 13, alignItems: "center", justifyContent: "center", marginTop: 18, borderWidth: 0, outlineStyle: "none" as any },
  modalPrimaryText: { color: colors.white, fontFamily: fonts.bold, textAlign: "center" },
  modalSecondary: { alignItems: "center", padding: 11 },
  modalSecondaryText: { color: colors.deepPink, fontFamily: fonts.bold }
});
// Composer floats mid-screen while idle (empty conversation, unfocused); on focus the empty-state
// copy fades out and the composer docks just above the tab bar. It is multiline and grows upward
// with the text (capped at 120pt), so on mobile it stays close to the keyboard as the user types.
