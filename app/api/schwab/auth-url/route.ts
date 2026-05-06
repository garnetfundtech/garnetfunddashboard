import { NextResponse } from "next/server";
import { getSchwabAuthUrl } from "@/lib/schwab";

export async function GET() {
  if (process.env.ENABLE_SCHWAB_SYNC !== "true") {
    return NextResponse.json(
      { ok: false, message: "Schwab integration is disabled by feature flag." },
      { status: 403 },
    );
  }

  const state = crypto.randomUUID();
  const url = getSchwabAuthUrl(state);
  return NextResponse.json({ ok: true, url, state });
}
