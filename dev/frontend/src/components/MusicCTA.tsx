import { Pressable, StyleSheet, Text } from "react-native";
import { colors, fonts, type } from "../theme";

// Small, link-weight affordance appended to an assistant message when that
// message's response carries a music_offer. Deliberately NOT a filled
// button -- clearly tappable, but must not read as a primary CTA.
export function MusicCTA({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open music suggestions"
      onPress={onPress}
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
      hitSlop={8}
    >
      <Text style={styles.text}>Here are some music »</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // minHeight/paddingVertical keep the touch target comfortable while the
  // visible text stays link-sized.
  wrap: { minHeight: 36, justifyContent: "center", paddingVertical: 6, marginTop: 2 },
  pressed: { opacity: 0.6 },
  text: { color: colors.deepPink, fontFamily: fonts.bold, fontSize: type.small },
});
