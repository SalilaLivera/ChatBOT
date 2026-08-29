import { Text, View, StyleSheet } from "react-native";
import { colors } from "../theme";
export function Chip({ label, tone = "sage" }: { label: string; tone?: "sage" | "lavender" | "peach" | "safety" }) { return <View style={[styles.base, { backgroundColor: { sage: colors.mint, lavender: colors.lavender, peach: colors.peach, safety: "#EDE3F1" }[tone] }]}><Text style={[styles.text, tone === "safety" && { color: colors.safety }]}>{label}</Text></View>; }
const styles = StyleSheet.create({ base: { alignSelf: "flex-start", borderRadius: 99, paddingHorizontal: 11, paddingVertical: 6 }, text: { color: colors.sageDark, fontSize: 12, fontWeight: "700" } });
