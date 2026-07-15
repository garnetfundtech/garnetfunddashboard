import { createBrowserClient } from "@supabase/ssr";
import { SAFE_SUPABASE_URL, SAFE_SUPABASE_ANON_KEY } from "./config";

export function createClient() {
  return createBrowserClient(
    SAFE_SUPABASE_URL,
    SAFE_SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    },
  );
}
