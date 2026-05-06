import { NextResponse } from "next/server";
import { getValidTraderToken } from "@/lib/market-data";
import { getMarketMovers } from "@/lib/schwab";

export async function GET() {

  const token = await getValidTraderToken();
  if (!token) {
    return NextResponse.json({ ok: false, message: "No valid Schwab token." }, { status: 401 });
  }

  try {
    const [gainers, losers] = await Promise.all([
      getMarketMovers(token, "$SPX", "PERCENT_CHANGE_UP"),
      getMarketMovers(token, "$SPX", "PERCENT_CHANGE_DOWN"),
    ]);
    return NextResponse.json({ ok: true, gainers: gainers.slice(0, 5), losers: losers.slice(0, 5) });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "Movers failed" },
      { status: 500 },
    );
  }
}
