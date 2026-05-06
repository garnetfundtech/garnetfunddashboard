import { NextRequest, NextResponse } from "next/server";
import { getSchwabAuthUrl } from "@/lib/schwab";

export async function GET(request: NextRequest) {
  if (process.env.ENABLE_SCHWAB_SYNC !== "true") {
    return NextResponse.json(
      { ok: false, message: "Schwab integration is disabled by feature flag." },
      { status: 403 },
    );
  }

  const providerParam = request.nextUrl.searchParams.get("provider");
  const provider = providerParam === "market" ? "market" : "trader";

  const state = crypto.randomUUID();
  const url = getSchwabAuthUrl(state, provider);
  return NextResponse.json({ ok: true, provider, url, state });
}
