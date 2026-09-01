import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/home/:path*",
    "/risk/:path*",
    "/risk-admin/:path*",
    "/users/:path*",
    "/research/:path*",
    "/resources/:path*",
    "/files/:path*",
    "/admin/:path*",
    "/onboarding",
    "/settings",
    "/set-password",
    "/pending",
    "/login",
    "/orders/:path*",
    "/coverage/:path*",
    "/alerts/:path*",
    "/watchlist/:path*",
    "/earnings/:path*",
  ],
};
