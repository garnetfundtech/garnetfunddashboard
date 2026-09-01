import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Landing point for Supabase invite / recovery / confirmation links.
 *
 * Supabase verifies the emailed token on its side and forwards here with
 * either a PKCE `code` (current default) or a legacy `token_hash` + `type`.
 * Both are traded for a real session cookie, after which the invitee is sent
 * to `next` (/set-password) to choose their own password. Without this route
 * an invite link dead-ends on the login form with no password to type.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  // Only same-origin paths — never redirect to a URL an email could smuggle in.
  const nextParam = searchParams.get("next") ?? "/set-password";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/set-password";

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as "invite" | "recovery" | "signup" | "email_change",
      token_hash: tokenHash,
    });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
  }

  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent("This invite link is invalid or has already been used.")}`,
  );
}
