import { PropsWithChildren, Ref } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { colors, spacing } from "../theme";
export function Screen({ children, scroll = true, scrollRef, onContentSizeChange }: PropsWithChildren<{ scroll?: boolean; scrollRef?: Ref<ScrollView>; onContentSizeChange?: (w: number, h: number) => void }>) { const content = <View style={styles.inner}>{children}</View>; return scroll ? <ScrollView ref={scrollRef} onContentSizeChange={onContentSizeChange} style={styles.flex} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">{content}</ScrollView> : <View style={styles.scroll}>{content}</View>; }
const styles = StyleSheet.create({ flex: { flex: 1 }, scroll: { flexGrow: 1, backgroundColor: colors.paper }, inner: { width: "100%", maxWidth: 860, alignSelf: "center", padding: spacing.lg, paddingTop: spacing.xl, paddingBottom: 110 } });
