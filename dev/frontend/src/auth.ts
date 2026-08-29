import { createClient } from "@supabase/supabase-js";
import { config } from "./config";

export const supabase = process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  ? createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY)
  : null;
export async function signIn(email: string, password: string) {
  if (!supabase) return { data: { user: { id: "demo-user" } }, error: null };
  return supabase.auth.signInWithPassword({ email, password });
}
export async function signOut() { if (supabase) await supabase.auth.signOut(); }
