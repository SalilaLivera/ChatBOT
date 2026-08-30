import { useState } from "react";
import { Text, View, StyleSheet } from "react-native";
import { Message } from "../store";
import { AssistantResponseContent } from "./AssistantResponseContent";
import { MusicCTA } from "./MusicCTA";
import { MusicOfferModal } from "./MusicOfferModal";
import { colors, fonts, spacing, type } from "../theme";

// Assistant bubble background by mood.state (owner-approved 2026-08-30).
// Unknown/absent mood falls back to the existing neutral appearance.
const moodBackground: Record<string, string> = {
  calm: colors.moodCalm,
  neutral: colors.moodNeutral,
  distressed: colors.moodDistressed,
};

// ---------------------------------------------------------------------------
// MOCK/DEBUG UI REMOVED 2026-08-30 (owner request)
//
// Three things were being shown to the user and no longer are:
//
//   1. THE MOOD CHIP — `mood.state` was rendered as a visible badge ("neutral").
//      ⛔ This is an internal value and must never be surfaced. The user is
//      never told what the system judged their mood to be: expression is not
//      emotion, and the FER model misses distress 24.3% of the time, so the
//      label is wrong often enough that displaying it is misleading as well as
//      out of contract (LLM_INTEGRATION_PLAN §3.2; SAFETY_POLICY §4.3).
//
//   2. THE RESPONSE-MODE CHIPS — "✦ Safety response" / "♡ Supportive response"
//      announced an internal routing decision to the user.
//
//   3. THE HARD-CODED SUGGESTION BODY — every suggestion rendered the literal
//      string "Take a slow breath in, then let it go gently." regardless of the
//      item. That was demo copy standing in for a catalogue that does not exist.
//
// `response_mode` is still used for SUBTLE CONTAINER STYLING only. It is
// application-controlled (never LLM-generated), so this is the app styling its
// own output rather than the model influencing presentation.
// ---------------------------------------------------------------------------

export function MessageBubble({ message }: { message: Message }) {
  const safety = message.response?.response_mode === "safety";
  const suggestion = message.response?.content_suggestion;
  const musicOffer = message.response?.music_offer ?? null;
  const [musicOpen, setMusicOpen] = useState(false);

  // Mood comes only from response data (mood.state), never computed from
  // message text here. Absent/unrecognised state -> existing neutral bg.
  const moodBg = message.role === "assistant"
    ? moodBackground[message.response?.mood.state ?? "neutral"] ?? colors.moodNeutral
    : undefined;

  return (
    <View style={[styles.wrap, message.role === "user" ? styles.userWrap : styles.assistantWrap]}>
      <View
        style={[
          styles.bubble,
          message.role === "user" ? styles.user : styles.assistant,
          message.role === "assistant" && { backgroundColor: moodBg },
          safety && styles.safety,
        ]}
      >
        {message.role === "assistant" && message.response ? (
          <AssistantResponseContent response={message.response} />
        ) : (
          <Text style={styles.text}>{message.text}</Text>
        )}

        {/* Application-controlled. The title comes from the approved catalogue —
            never from the LLM, and never invented here. No body text is
            rendered, because no catalogue field supplies one. */}
        {suggestion && (
          <View style={styles.suggestion}>
            <Text style={styles.suggestionTitle}>♡ {suggestion.title}</Text>
          </View>
        )}

        {/* Only rendered when the backend actually returned a music_offer --
            no CTA, no placeholder, when it is null/absent. */}
        {musicOffer && <MusicCTA onPress={() => setMusicOpen(true)} />}
      </View>
      {musicOffer && (
        <MusicOfferModal visible={musicOpen} offer={musicOffer} onClose={() => setMusicOpen(false)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%", marginBottom: spacing.md },
  userWrap: { alignItems: "flex-end" },
  assistantWrap: { alignItems: "flex-start" },
  bubble: { maxWidth: "82%", borderRadius: 20, padding: spacing.md, gap: 10 },
  user: {
    backgroundColor: "#FDF4F7",
    borderBottomRightRadius: 5,
    borderWidth: 1,
    borderColor: colors.lightPink,
  },
  assistant: {
    backgroundColor: "#FFFFFF",
    borderBottomLeftRadius: 5,
    borderWidth: 1,
    borderColor: colors.border,
  },
  safety: { backgroundColor: "#F7F0F8", borderColor: "#D9C6E0" },

  // The base text style for a user message. AssistantResponseContent's
  // `paragraph` is kept byte-identical to this so an assistant reply and a user
  // message render at the same size, weight, colour and line height.
  text: { color: colors.ink, fontFamily: fonts.regular, fontSize: type.body, lineHeight: 25 },

  // Part of the SAME message area — separated by a hairline rule rather than
  // wrapped in its own bordered card, so an assistant turn reads as one block.
  suggestion: {
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  suggestionTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: type.body },
});
