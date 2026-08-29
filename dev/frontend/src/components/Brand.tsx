import { Text, View, StyleSheet } from "react-native";
import { colors, type } from "../theme";
export function Brand() { return <View style={styles.row}><View style={styles.mark}><Text style={styles.markText}>M</Text></View><Text style={styles.name}>Maathru <Text style={styles.link}>Care</Text></Text></View>; }
const styles = StyleSheet.create({ row: { flexDirection: "row", alignItems: "center", gap: 10 }, mark: { width: 38, height: 38, borderRadius: 14, backgroundColor: colors.sageDark, alignItems: "center", justifyContent: "center" }, markText: { color: colors.white, fontSize: 21, fontWeight: "800" }, name: { color: colors.ink, fontSize: 20, fontWeight: "700" }, link: { color: colors.sageDark } });
