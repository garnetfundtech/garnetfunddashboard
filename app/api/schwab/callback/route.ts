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
    // Nothing maintains this column on its own — no trigger, and the refresh
    // path omitted it too — so /admin was reporting "last refreshed" as the
    // day the row was first written, months out of date.
    updated_at: new Date().toISOString(),
  });

  // A fresh token means the re-auth warning has been acted on, so clear it
  // rather than waiting for the next cron to notice the new expiry: otherwise
  // re-authenticating inside the warning window leaves a stale 'warning' on
  // the row and suppresses the next cycle's notice.
  //
  // Deliberately a separate, swallowed write rather than two more fields on
  // the upsert above. These columns arrive with migration 0028, and folding
  // them into the token write would mean an unapplied migration takes the
  // whole OAuth flow down — breaking the one thing this route exists to do,
  // to keep an alert's bookkeeping tidy. Worst case the stale stage costs one
  // missed reminder, which the next expiry cycle corrects on its own.
  // The error is discarded, not thrown: supabase-js reports a missing column
  // in the result rather than by rejecting, so this is inert until 0028 runs.
  await admin
    .from("schwab_tokens")
    .update({ reauth_alert_stage: null, reauth_alert_sent_for: null })
    .eq("id", provider);

  return NextResponse.json({
    ok: true,
    provider,
    message: "Schwab tokens stored.",
    scope: tokenData.scope ?? "",
  });
}
