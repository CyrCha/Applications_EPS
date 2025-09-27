import { createClient } from "@supabase/supabase-js";

// We use NEXT_PUBLIC_* so the client can access them in the browser.
// Make sure to set these in your .env.local file.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  // Soft warning to help during local dev if env vars are missing
  // eslint-disable-next-line no-console
  console.warn(
    "Supabase environment variables are not set. Please define NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local"
  );
}

export const supabase = createClient(supabaseUrl ?? "", supabaseAnonKey ?? "");
