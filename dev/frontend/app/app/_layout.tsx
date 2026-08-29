import { Tabs } from "expo-router";
import { colors } from "@/theme";
import { TabBar } from "@/components/TabBar";
export default function AppLayout() { return <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}><Tabs.Screen name="home" /><Tabs.Screen name="profile" /><Tabs.Screen name="chat" options={{ href: null }} /><Tabs.Screen name="insights" /><Tabs.Screen name="settings" /></Tabs>; }
