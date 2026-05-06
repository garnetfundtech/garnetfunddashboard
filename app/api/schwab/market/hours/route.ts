import { NextResponse } from "next/server";
import { getValidTraderToken, fetchMarketOverview } from "@/lib/market-data";

export async function GET() {
  const token = await getValidTraderToken();
  if (!token) {
    return NextResponse.json({ ok: false, message: "No valid Schwab token." }, { status: 401 });
  }

  try {
    const overview = await fetchMarketOverview();
    if (!overview) {
      return NextResponse.json({ ok: false, message: "Could not fetch market data." }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      isOpen: overview.isOpen,
      session: overview.session,
      sessionEnd: overview.sessionEnd,
      indices: overview.indices,
      gainers: overview.gainers,
      losers: overview.losers,
      fetchedAt: overview.fetchedAt,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "Market hours failed" },
      { status: 500 },
    );
  }
}
