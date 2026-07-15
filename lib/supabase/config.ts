/**
 * Shared Supabase public config + a "configured?" guard.
 *
 * The app's env vars can be blank locally (e.g. before `vercel env pull` or
 * before pasting credentials into `.env.local`). Empty strings still reach the
 * Supabase client constructors and throw "Your project's URL and Key are
 * required…", which crashes the middleware on every route. These helpers let
 * the app degrade to the login screen instead of a fatal error.
 *
 * In production the env vars are set, so `isSupabaseConfigured` is true and the
 * SAFE_* fallbacks are never used — zero behavior change.
 */

// `|| ""` (not `??`) so blank strings are treated as unset.
export const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
export const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "").trim();

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// Non-empty placeholders so the SSR/browser clients construct without throwing
// when credentials are absent. With no auth cookie present, calls resolve to
// "no user" and the app routes to /login — no network hit, no crash.
export const SAFE_SUPABASE_URL = SUPABASE_URL || "http://127.0.0.1:54321";
export const SAFE_SUPABASE_ANON_KEY = SUPABASE_ANON_KEY || "local-development-placeholder-anon-key";
