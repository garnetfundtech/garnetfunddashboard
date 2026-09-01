import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SAFE_SUPABASE_URL, SAFE_SUPABASE_ANON_KEY } from "./config";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    SAFE_SUPABASE_URL,
    SAFE_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Next forbids writing cookies while rendering a Server Component,
            // and Supabase calls setAll here whenever it rotates an expired
            // access token. Swallowing it is safe *because* proxy.ts refreshes
            // the session first on every matched route, where writes are
            // allowed — this is only the fallback for a render that slipped
            // past the matcher. Without the catch, that render throws.
          }
        },
      },
    },
  );
}
