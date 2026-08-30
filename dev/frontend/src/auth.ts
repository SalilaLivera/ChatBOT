import { createClient, type Session } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

// Missing Supabase configuration is a visible error (thrown, surfaced to the
// caller/store), never a silent shared "demo-user" identity.
export async function signInAnonymously(): Promise<Session> {
  if (!supabase) {
    throw new Error("Supabase is not configured: set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.");
  }
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  if (!data.session) throw new Error("Supabase anonymous sign-in returned no session.");
  return data.session;
}

export async function signOut(): Promise<void> {
  if (supabase) await supabase.auth.signOut();
}
