import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchMarketOverview, fetchPortfolioSummary } from "@/lib/market-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [marketResult, portfolioResult] = await Promise.allSettled([
    fetchMarketOverview(),
    fetchPortfolioSummary(),
  ]);

  const market = marketResult.status === "fulfilled" ? marketResult.value : null;
  const portfolio = portfolioResult.status === "fulfilled" ? portfolioResult.value : null;

  return NextResponse.json({
    session: market?.session ?? "closed",
    isOpen: market?.isOpen ?? false,
    indices: (market?.indices ?? []).map((idx) => ({
      symbol: idx.symbol,
      label: idx.label,
      dayPct: idx.pctChange,
    })),
    positions: (portfolio?.positions ?? []).map((pos) => ({
      ticker: pos.ticker,
      name: pos.name,
      dayPct: pos.dayPnlPct,
      allTimePct: pos.unrealizedPnlPct,
    })),
    fetchedAt: new Date().toISOString(),
  });
}
