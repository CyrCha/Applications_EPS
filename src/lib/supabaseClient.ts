import { createClient } from "@supabase/supabase-js";

// We use NEXT_PUBLIC_* so the client can access them in the browser.
// Make sure to set these in your .env.local file.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const SUPABASE_CONFIG_ERROR =
  "Configuration Supabase manquante : définissez NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY.";

if (!isSupabaseConfigured) {
  console.warn(SUPABASE_CONFIG_ERROR);
}

// Placeholders keep `createClient` from throwing at import time so the app can
// render a readable configuration error instead of a blank page.
export const supabase = createClient(
  supabaseUrl || "http://localhost:54321",
  supabaseAnonKey || "missing-anon-key",
  { realtime: { params: { eventsPerSecond: 5 } } }
);
