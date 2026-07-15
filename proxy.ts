import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/home/:path*",
    "/risk/:path*",
    "/users/:path*",
    "/research/:path*",
    "/resources/:path*",
    "/admin/:path*",
    "/onboarding",
    "/login",
    "/orders/:path*",
    "/coverage/:path*",
    "/alerts/:path*",
    "/watchlist/:path*",
    "/earnings/:path*",
  ],
};
