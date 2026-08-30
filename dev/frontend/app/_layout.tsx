import { useEffect } from "react";
import { Stack } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { Text, TextInput } from "react-native";
import { useFonts } from "expo-font";
import { Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold } from "@expo-google-fonts/nunito";
import { NotoSansSinhala_400Regular, NotoSansSinhala_700Bold } from "@expo-google-fonts/noto-sans-sinhala";
import { useAppStore } from "@/store";
const queryClient = new QueryClient();
export default function RootLayout() { const [loaded] = useFonts({ Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold, NotoSansSinhala_400Regular, NotoSansSinhala_700Bold }); useEffect(() => { void useAppStore.getState().signInAnonymously(); }, []); if (!loaded) return null; (Text as any).defaultProps = { ...(Text as any).defaultProps, style: [{ fontFamily: "Nunito_400Regular" }, (Text as any).defaultProps?.style] }; (TextInput as any).defaultProps = { ...(TextInput as any).defaultProps, textAlignVertical: "center" }; return <QueryClientProvider client={queryClient}><StatusBar style="dark" /><Stack screenOptions={{ headerShown: false }} /></QueryClientProvider>; }
