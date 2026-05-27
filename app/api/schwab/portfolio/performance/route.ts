import { NextRequest, NextResponse } from "next/server";
import { getValidTraderToken } from "@/lib/market-data";
import { getAccountPositions, getPriceHistory } from "@/lib/schwab";

type PeriodKey = "1D" | "1W" | "2W" | "1M" | "3M" | "6M" | "1Y" | "YTD";

const PERIOD_PARAMS: Record<PeriodKey, {
  periodType: "day" | "month" | "year" | "ytd";
  period: number;
  frequencyType: "minute" | "daily";
  frequency: number;
}> = {
  "1D":  { periodType: "day",   period: 1,  frequencyType: "minute", frequency: 15 },
  "1W":  { periodType: "day",   period: 5,  frequencyType: "minute", frequency: 30 },
  "2W":  { periodType: "day",   period: 10, frequencyType: "minute", frequency: 30 },
  "1M":  { periodType: "month", period: 1,  frequencyType: "daily",  frequency: 1 },
  "3M":  { periodType: "month", period: 3,  frequencyType: "daily",  frequency: 1 },
  "6M":  { periodType: "month", period: 6,  frequencyType: "daily",  frequency: 1 },
  "1Y":  { periodType: "year",  period: 1,  frequencyType: "daily",  frequency: 1 },
  "YTD": { periodType: "ytd",   period: 1,  frequencyType: "daily",  frequency: 1 },
};

function formatDate(datetime: number, period: PeriodKey): string {
  const d = new Date(datetime);
  if (period === "1D") {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export async function GET(request: NextRequest) {
  const periodParam = (request.nextUrl.searchParams.get("period") ?? "YTD") as PeriodKey;
  const period: PeriodKey = Object.keys(PERIOD_PARAMS).includes(periodParam) ? periodParam : "YTD";
  const params = PERIOD_PARAMS[period];

  const token = await getValidTraderToken();
  if (!token) return NextResponse.json({ ok: false, candles: [] }, { status: 401 });

  try {
    // Fetch positions directly (avoids a second getValidTraderToken + Supabase round-trip)
    const raw = await getAccountPositions(token);
    const accountList = Array.isArray(raw) ? raw : [raw];
    const first = accountList[0];
    if (!first?.securitiesAccount) return NextResponse.json({ ok: false, candles: [] });

    const sec = first.securitiesAccount;
    const balances = sec.currentBalances ?? sec.initialBalances ?? {};
    const aggBalance = first.aggregatedBalance ?? {};
    const cashAvailable = Number(balances.cashAvailableForTrading ?? 0);
    const longMarketValue = Number(balances.longMarketValue ?? 0);
    const apiLiqValue = Number(aggBalance.currentLiquidationValue ?? balances.liquidationValue ?? 0);
    const liquidationValue = Math.max(apiLiqValue, cashAvailable + longMarketValue);

    const rawPositions: Record<string, unknown>[] = sec.positions ?? [];
    const positionList = rawPositions
      .map((p) => {
        const inst = p.instrument as Record<string, unknown> | undefined;
        const ticker = String(inst?.symbol ?? "").toUpperCase();
        if (!ticker) return null;
        const qty = Number(p.longQuantity ?? 0);
        const marketValue = Number(p.marketValue ?? 0);
        return { ticker, qty, marketValue };
      })
      .filter((p): p is { ticker: string; qty: number; marketValue: number } => p !== null && p.qty > 0);

    if (!positionList.length) return NextResponse.json({ ok: false, candles: [] });

    // Top 10 by market value
    const positions = [...positionList]
      .sort((a, b) => b.marketValue - a.marketValue)
      .slice(0, 10);

    // Fetch price history for each position in parallel
    const histByTicker: Record<string, { datetime: number; close: number }[]> = {};
    await Promise.all(
      positions.map(async (pos) => {
        try {
          const hist = await getPriceHistory(
            token,
            pos.ticker,
            params.periodType,
            params.period,
            params.frequencyType,
            params.frequency,
          );
          if (hist.candles?.length) {
            histByTicker[pos.ticker] = hist.candles.map((c: Record<string, unknown>) => ({
              datetime: Number(c.datetime),
              close: Number(c.close),
            }));
          }
        } catch { /* skip */ }
      }),
    );

    const tickers = Object.keys(histByTicker);
    if (!tickers.length) return NextResponse.json({ ok: false, candles: [] });

    // Use the ticker with the most candles as the datetime reference
    const refTicker = tickers.reduce((a, b) =>
      histByTicker[a].length >= histByTicker[b].length ? a : b
    );
    const refCandles = histByTicker[refTicker];

    // Build datetime → close map for each ticker
    const closeMapByTicker: Record<string, Map<number, number>> = {};
    for (const t of tickers) {
      closeMapByTicker[t] = new Map(histByTicker[t].map((c) => [c.datetime, c.close]));
    }

    // Base price = first available close for each ticker
    const basePriceByTicker: Record<string, number> = {};
    for (const t of tickers) {
      basePriceByTicker[t] = histByTicker[t][0]?.close ?? 0;
    }

    const coveredPositions = positions.filter(
      (p) => tickers.includes(p.ticker) && basePriceByTicker[p.ticker] > 0,
    );
    if (!coveredPositions.length) return NextResponse.json({ ok: false, candles: [] });

    // Compute weighted portfolio return at each reference datetime
    const candles = refCandles.map((ref) => {
      let weightedReturn = 0;
      let weightSum = 0;

      for (const pos of coveredPositions) {
        const base = basePriceByTicker[pos.ticker];
        if (!base) continue;
        const close = closeMapByTicker[pos.ticker]?.get(ref.datetime);
        if (close == null) continue;
        const ret = ((close - base) / base) * 100;
        // True portfolio weight: position market value / total AUM (includes cash)
        const w = liquidationValue > 0 ? pos.marketValue / liquidationValue : 0;
        weightedReturn += w * ret;
        weightSum += w;
      }

      return {
        date: formatDate(ref.datetime, period),
        portfolio: weightSum > 0 ? parseFloat(weightedReturn.toFixed(2)) : null,
      };
    });

    return NextResponse.json({ ok: true, candles });
  } catch (err) {
    return NextResponse.json({ ok: false, candles: [], error: String(err) });
  }
}
