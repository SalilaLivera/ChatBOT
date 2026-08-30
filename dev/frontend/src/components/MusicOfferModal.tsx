import { Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import { MusicOffer, MusicSong } from "../api/contracts";
import { colors, fonts, spacing, type } from "../theme";

// Visual language reused verbatim from the camera-consent modal in
// chat.tsx (modalRoot / scrim / BlurView / modalCard / modalHeader /
// modalPrimary-style rows) -- not a new modal design.
export function MusicOfferModal({ visible, offer, onClose }: { visible: boolean; offer: MusicOffer | null; onClose: () => void }) {
  async function openSong(song: MusicSong) {
    // song.url is trusted, backend-supplied, approved-catalogue data --
    // never constructed, modified, or sanitised here.
    if (Platform.OS === "web") {
      window.open(song.url, "_blank");
    } else {
      try { await Linking.openURL(song.url); } catch { /* best-effort */ }
    }
    onClose();
  }

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <BlurView intensity={28} tint="light" style={StyleSheet.absoluteFill} />
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View style={styles.modalIcon}><Text style={styles.modalIconText}>♪</Text></View>
            <Text style={styles.modalTitle}>Music for you</Text>
          </View>
          <View style={styles.songs}>
            {(offer?.songs ?? []).map(song => (
              <Pressable
                key={song.id}
                accessibilityRole="button"
                accessibilityLabel={song.title}
                onPress={() => openSong(song)}
                style={({ pressed }) => [styles.songButton, pressed && styles.songButtonPressed]}
              >
                <Text style={styles.songTitle}>{song.title}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={styles.modalSecondary} onPress={onClose}>
            <Text style={styles.modalSecondaryText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(48,39,42,.16)" },
  modalCard: { width: "100%", maxWidth: 420, backgroundColor: colors.card, borderRadius: 26, padding: spacing.lg, shadowColor: colors.ink, shadowOpacity: 0.18, shadowRadius: 24, elevation: 8 },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 13 },
  modalIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.lightPink, alignItems: "center", justifyContent: "center" },
  modalIconText: { color: colors.deepPink, fontSize: 25 },
  modalTitle: { color: colors.ink, fontFamily: fonts.extraBold, fontSize: 21, flex: 1 },
  songs: { marginTop: 18, gap: 10 },
  songButton: { minHeight: 54, borderRadius: 15, paddingHorizontal: 16, justifyContent: "center", backgroundColor: colors.veryLightPink, borderWidth: 1, borderColor: colors.border },
  songButtonPressed: { backgroundColor: colors.lightPink },
  songTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: type.body },
  modalSecondary: { alignItems: "center", padding: 11, marginTop: 8 },
  modalSecondaryText: { color: colors.deepPink, fontFamily: fonts.bold },
});
