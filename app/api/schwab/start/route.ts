import { NextRequest, NextResponse } from "next/server";
import { getSchwabAuthUrl } from "@/lib/schwab";
import { randomUUID } from "crypto";

export async function GET(request: NextRequest) {
  if (process.env.ENABLE_SCHWAB_SYNC !== "true") {
    return NextResponse.json(
      { ok: false, message: "Schwab sync is disabled. Set ENABLE_SCHWAB_SYNC=true." },
      { status: 503 },
    );
  }

  const providerParam = request.nextUrl.searchParams.get("provider");
  const provider = providerParam === "market" ? "market" : "trader";
  const state = `${provider}:${randomUUID()}`;

  try {
    const url = getSchwabAuthUrl(state, provider);
    return NextResponse.redirect(url);
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "Failed to build auth URL" },
      { status: 500 },
    );
  }
}
