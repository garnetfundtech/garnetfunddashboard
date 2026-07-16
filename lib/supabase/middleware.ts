import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, SUPABASE_URL, SUPABASE_ANON_KEY } from "./config";
import { ROUTES } from "@/lib/nav-access";

// Every dashboard route (from the nav single source of truth) plus onboarding.
// Deriving this from ROUTES keeps middleware in sync when new pages are added —
// /risk was silently missing from a previous hand-maintained copy of this list.
const PROTECTED_PATHS = [...Object.values(ROUTES), "/onboarding"];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // No credentials (e.g. local dev without env) — don't crash every route; let
  // pages render. Page-level guards still redirect unauthenticated users.
  if (!isSupabaseConfigured) {
    return response;
  }

  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isProtected = PROTECTED_PATHS.some((path) => request.nextUrl.pathname.startsWith(path));
  const isLogin = request.nextUrl.pathname.startsWith("/login");

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/home";
    return NextResponse.redirect(url);
  }

  return response;
}
