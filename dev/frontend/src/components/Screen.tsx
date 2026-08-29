import { PropsWithChildren } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { colors, spacing } from "../theme";
export function Screen({ children, scroll = true }: PropsWithChildren<{ scroll?: boolean }>) { const content = <View style={styles.inner}>{children}</View>; return scroll ? <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">{content}</ScrollView> : <View style={styles.scroll}>{content}</View>; }
const styles = StyleSheet.create({ scroll: { flexGrow: 1, backgroundColor: colors.paper }, inner: { width: "100%", maxWidth: 860, alignSelf: "center", padding: spacing.lg, paddingTop: spacing.xl, paddingBottom: 110 } });
