import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshAccessToken } from "@/lib/schwab";

export async function POST() {
  if (process.env.ENABLE_SCHWAB_SYNC !== "true") {
    return NextResponse.json(
      { ok: false, message: "Schwab integration is disabled by feature flag." },
      { status: 403 },
    );
  }

  const admin = createAdminClient();
  const { data: tokenRow } = await admin.from("schwab_tokens").select("*").eq("id", "master").single();

  if (!tokenRow?.refresh_token) {
    return NextResponse.json({ ok: false, message: "No refresh token available." }, { status: 400 });
  }

  try {
    const refreshed = await refreshAccessToken(tokenRow.refresh_token);
    await admin
      .from("schwab_tokens")
      .update({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token ?? tokenRow.refresh_token,
        expires_at: new Date(Date.now() + Number(refreshed.expires_in ?? 1800) * 1000).toISOString(),
        needs_reauth: false,
      })
      .eq("id", "master");

    return NextResponse.json({ ok: true });
  } catch {
    await admin.from("schwab_tokens").update({ needs_reauth: true }).eq("id", "master");
    return NextResponse.json(
      { ok: false, message: "Refresh failed. Manual re-authorization required." },
      { status: 401 },
    );
  }
}
