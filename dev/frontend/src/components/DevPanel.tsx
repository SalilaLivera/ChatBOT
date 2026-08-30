import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAppStore, moodLabels, responseLabels } from "../store";
import { colors, spacing } from "../theme";
// ⛔ mood.state must NOT appear anywhere in user-facing UI (the mood chip was
// deliberately removed -- FER misses distress 24.3% of the time and every
// mood is currently derived from placeholder fusion parameters). This panel
// is dev-only, gated by the caller behind `showDev`.
export function DevPanel() {
  const { scenario, setScenario, lastMoodAnalysis, authenticated, authError } = useAppStore();
  return <View style={styles.panel}>
    <Text style={styles.title}>Live mood analysis (backend)</Text>
    <Text style={styles.label}>Auth: {authenticated ? "signed in" : authError ? `error — ${authError}` : "signing in…"}</Text>
    {lastMoodAnalysis
      ? <Text style={styles.label}>state={lastMoodAnalysis.state} confidence={lastMoodAnalysis.confidence.toFixed(2)} modalities=[{lastMoodAnalysis.modalities_used.join(", ")}] fusion={lastMoodAnalysis.fusion_version}</Text>
      : <Text style={styles.label}>No mood/analyse response yet.</Text>}
    <Text style={styles.title}>Demo controls</Text>
    <Text style={styles.label}>Mood state</Text><View style={styles.row}>{Object.entries(moodLabels).map(([key, label]) => <Pressable key={key} onPress={() => setScenario({ mood: key as any })} style={[styles.option, scenario.mood === key && styles.active]}><Text style={styles.optionText}>{label}</Text></Pressable>)}</View><Text style={styles.label}>Response style</Text><View style={styles.row}>{Object.entries(responseLabels).map(([key, label]) => <Pressable key={key} onPress={() => setScenario({ responseMode: key as any })} style={[styles.option, scenario.responseMode === key && styles.active]}><Text style={styles.optionText}>{label}</Text></Pressable>)}</View><View style={styles.row}><Pressable onPress={() => setScenario({ failure: !scenario.failure })} style={[styles.option, scenario.failure && styles.active]}><Text style={styles.optionText}>Next message fails</Text></Pressable><Pressable onPress={() => setScenario({ suggestion: !scenario.suggestion })} style={[styles.option, !scenario.suggestion && styles.active]}><Text style={styles.optionText}>Suggestion off</Text></Pressable></View>
  </View>;
}
const styles = StyleSheet.create({ panel: { backgroundColor: "#F0F5F0", borderRadius: 18, padding: spacing.md, marginTop: spacing.lg, gap: 9 }, title: { color: colors.ink, fontWeight: "800", fontSize: 16 }, label: { color: colors.muted, fontSize: 12, fontWeight: "700", marginTop: 4 }, row: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, option: { minHeight: 36, paddingHorizontal: 10, justifyContent: "center", borderRadius: 9, backgroundColor: colors.white }, active: { backgroundColor: colors.sage }, optionText: { color: colors.ink, fontSize: 12 } });
