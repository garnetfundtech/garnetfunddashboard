/**
 * The fund's own cumulative return series, as a % of NAV at the start of the
 * period — shared between the chart's client-side fetch
 * (app/api/schwab/portfolio/performance) and any server-side caller that
 * needs "our YTD return" as a single number (the home page's KPI tile).
 *
 * Extracted from what was originally only the API route's handler so the two
 * call sites can't drift into computing this two different ways.
 */
import { unstable_cache } from "next/cache";
import { getValidTraderToken } from "@/lib/market-data";
import { getAccountPositions, getPriceHistory } from "@/lib/schwab";
import { createAdminClient } from "@/lib/supabase/admin";

export type PerformancePeriod = "1D" | "1W" | "2W" | "1M" | "3M" | "6M" | "1Y" | "YTD";

const PERIOD_PARAMS: Record<PerformancePeriod, {
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

function formatDate(datetime: number, period: PerformancePeriod): string {
  const d = new Date(datetime);
  if (period === "1D") {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export type PortfolioPerformanceResult = {
  ok: boolean;
  candles: { date: string; portfolio: number }[];
  /** The single most recent cumulative return %, i.e. "our return so far this period." */
  latestPct: number | null;
};

export async function getPortfolioPerformance(period: PerformancePeriod): Promise<PortfolioPerformanceResult> {
  const params = PERIOD_PARAMS[period];
  const token = await getValidTraderToken();
  if (!token) return { ok: false, candles: [], latestPct: null };

  try {
    const raw = await getAccountPositions(token);
    const accountList = Array.isArray(raw) ? raw : [raw];
    const first = accountList[0];
    if (!first?.securitiesAccount) return { ok: false, candles: [], latestPct: null };

    const sec = first.securitiesAccount;
    const balances = sec.currentBalances ?? sec.initialBalances ?? {};
    const aggBalance = first.aggregatedBalance ?? {};
    const cashAvailable = Number(balances.cashAvailableForTrading ?? 0);
    const longMarketValue = Number(balances.longMarketValue ?? 0);
    const apiLiqValue = Number(aggBalance.currentLiquidationValue ?? balances.liquidationValue ?? 0);
    const liquidationValue = Math.max(apiLiqValue, cashAvailable + longMarketValue);

    const rawPositions: Record<string, unknown>[] = sec.positions ?? [];
    const heldPositions = rawPositions
      .map((p) => {
        const inst = p.instrument as Record<string, unknown> | undefined;
        const ticker = String(inst?.symbol ?? "").toUpperCase();
        if (!ticker) return null;
        const qty = Number(p.longQuantity ?? 0);
        const avgCost = Number(p.averagePrice ?? 0);
        const marketValue = Number(p.marketValue ?? 0);
        const unrealizedPnl = Number(p.longOpenProfitLoss ?? (marketValue - avgCost * qty));
        return { ticker, qty, avgCost, marketValue, unrealizedPnl };
      })
      .filter((p): p is { ticker: string; qty: number; avgCost: number; marketValue: number; unrealizedPnl: number } => p !== null && p.qty > 0);

    let realizedRows: { filled_at: string; gain_loss: number }[] = [];
    try {
      const admin = createAdminClient();
      const { data } = await admin
        .from("realized_gains")
        .select("filled_at, gain_loss")
        .order("filled_at", { ascending: true });
      if (data) {
        realizedRows = data
          .map((r) => ({ filled_at: String(r.filled_at), gain_loss: Number(r.gain_loss ?? 0) }))
          .filter((r) => Number.isFinite(r.gain_loss));
      }
    } catch { /* table missing or empty — non-fatal */ }

    const spy = await getPriceHistory(token, "SPY", params.periodType, params.period, params.frequencyType, params.frequency);
    if (!spy.candles?.length) return { ok: false, candles: [], latestPct: null };
    const dateAxis: { datetime: number; date: string }[] = spy.candles.map((c: Record<string, unknown>) => ({
      datetime: Number(c.datetime),
      date: formatDate(Number(c.datetime), period),
    }));

    const histByTicker: Record<string, { datetime: number; close: number }[]> = {};
    if (heldPositions.length) {
      const top = [...heldPositions].sort((a, b) => b.marketValue - a.marketValue).slice(0, 10);
      await Promise.all(
        top.map(async (pos) => {
          try {
            const hist = await getPriceHistory(token, pos.ticker, params.periodType, params.period, params.frequencyType, params.frequency);
            if (hist.candles?.length) {
              histByTicker[pos.ticker] = hist.candles.map((c: Record<string, unknown>) => ({
                datetime: Number(c.datetime),
                close: Number(c.close),
              }));
            }
          } catch { /* skip */ }
        }),
      );
    }

    const closeMapByTicker: Record<string, Map<number, number>> = {};
    for (const [t, candles] of Object.entries(histByTicker)) {
      closeMapByTicker[t] = new Map(candles.map((c) => [c.datetime, c.close]));
    }
    void closeMapByTicker; // kept for parity with the lookup shape; lookbehind loop below does the actual read

    const currentUnrealized = heldPositions.reduce((s, p) => s + p.unrealizedPnl, 0);

    const periodStart = dateAxis[0]?.datetime ?? 0;
    const realizedInPeriod = realizedRows.filter((r) => new Date(r.filled_at).getTime() >= periodStart);
    const realizedInPeriodTotal = realizedInPeriod.reduce((s, r) => s + r.gain_loss, 0);
    const startingValue = Math.max(liquidationValue - realizedInPeriodTotal - currentUnrealized, 1);

    const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    const candles = dateAxis.map((d) => {
      const candleDay = dayKey(d.datetime);
      const cumRealized = realizedInPeriod
        .filter((r) => dayKey(new Date(r.filled_at).getTime()) <= candleDay)
        .reduce((s, r) => s + r.gain_loss, 0);

      let unrealizedAtDate = 0;
      for (const pos of heldPositions) {
        const hist = histByTicker[pos.ticker];
        if (!hist) continue;
        let priceAt: number | null = null;
        for (let i = hist.length - 1; i >= 0; i--) {
          if (hist[i].datetime <= d.datetime) { priceAt = hist[i].close; break; }
        }
        if (priceAt == null) continue;
        unrealizedAtDate += (priceAt - pos.avgCost) * pos.qty;
      }

      const totalGain = cumRealized + unrealizedAtDate;
      const pct = (totalGain / startingValue) * 100;
      return { date: d.date, portfolio: parseFloat(pct.toFixed(2)) };
    });

    return { ok: true, candles, latestPct: candles.length ? candles[candles.length - 1].portfolio : null };
  } catch {
    return { ok: false, candles: [], latestPct: null };
  }
}

/** Shared 60s cache — this does several live price-history calls per position, so
 *  every open tab/user hitting the home page or the chart shouldn't each trigger it fresh. */
export const getCachedPortfolioPerformance = unstable_cache(
  getPortfolioPerformance,
  ["portfolio-performance-v1"],
  { revalidate: 60, tags: ["schwab-portfolio-performance"] },
);
