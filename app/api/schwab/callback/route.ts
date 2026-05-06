import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeCodeForTokens } from "@/lib/schwab";

function providerFromState(state: string | null) {
  if (!state) return null;
  const [maybeProvider] = state.split(":", 1);
  if (maybeProvider === "market" || maybeProvider === "trader") return maybeProvider;
  return null;
}

export async function GET(request: NextRequest) {
  if (process.env.ENABLE_SCHWAB_SYNC !== "true") {
    return NextResponse.json(
      { ok: false, message: "Schwab integration is disabled by feature flag." },
      { status: 403 },
    );
  }

  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ ok: false, message: "Missing code parameter." }, { status: 400 });
  }

  // Callback URL in Schwab app registration must not include query params.
  // We infer provider from OAuth state (preferred), but keep query param support for manual testing.
  const providerParam = request.nextUrl.searchParams.get("provider");
  const state = request.nextUrl.searchParams.get("state");
  const provider =
    providerParam === "market"
      ? "market"
      : providerParam === "trader"
        ? "trader"
        : providerFromState(state) ?? "trader";

  const tokenData = await exchangeCodeForTokens(code, provider);
  const admin = createAdminClient();

  const expiresAt = new Date(Date.now() + Number(tokenData.expires_in ?? 1800) * 1000).toISOString();
  const refreshExpiresAt = new Date(
    Date.now() + Number(tokenData.refresh_token_expires_in ?? 604800) * 1000,
  ).toISOString();

  await admin.from("schwab_tokens").upsert({
    id: provider,
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    token_type: tokenData.token_type ?? "Bearer",
    scope: tokenData.scope ?? "",
    expires_at: expiresAt,
    refresh_expires_at: refreshExpiresAt,
    needs_reauth: false,
  });

  return NextResponse.json({
    ok: true,
    provider,
    message: "Schwab tokens stored.",
    scope: tokenData.scope ?? "",
  });
}
