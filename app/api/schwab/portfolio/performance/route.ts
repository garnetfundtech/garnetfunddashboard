import { NextRequest, NextResponse } from "next/server";
import { getValidTraderToken } from "@/lib/market-data";
import { getAccountPositions, getPriceHistory } from "@/lib/schwab";
import { createAdminClient } from "@/lib/supabase/admin";

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
    // Account snapshot (positions + balances)
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

    // Realized gains from Supabase (gain_loss, filled_at)
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
    const totalRealized = realizedRows.reduce((s, r) => s + r.gain_loss, 0);

    // SPY price history is the canonical date axis (always exists for any period)
    const spy = await getPriceHistory(
      token,
      "SPY",
      params.periodType,
      params.period,
      params.frequencyType,
      params.frequency,
    );
    if (!spy.candles?.length) return NextResponse.json({ ok: false, candles: [] });
    const dateAxis: { datetime: number; date: string }[] = spy.candles.map((c: Record<string, unknown>) => ({
      datetime: Number(c.datetime),
      date: formatDate(Number(c.datetime), period),
    }));

    // Per-position price history (for unrealized P&L over time on currently held names)
    const histByTicker: Record<string, { datetime: number; close: number }[]> = {};
    if (heldPositions.length) {
      const top = [...heldPositions].sort((a, b) => b.marketValue - a.marketValue).slice(0, 10);
      await Promise.all(
        top.map(async (pos) => {
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
    }

    // Map of datetime → close for each held ticker
    const closeMapByTicker: Record<string, Map<number, number>> = {};
    for (const [t, candles] of Object.entries(histByTicker)) {
      closeMapByTicker[t] = new Map(candles.map((c) => [c.datetime, c.close]));
    }

    // Current unrealized P&L across all held positions
    const currentUnrealized = heldPositions.reduce((s, p) => s + p.unrealizedPnl, 0);

    // Approximate the portfolio value at the START of the period:
    //   start = current_AUM − total_realized_in_period − current_unrealized
    // For periods that don't span the realized-gain dates (e.g. "1W") this still
    // gives a reasonable baseline because the realized gains outside the window
    // were already reflected in pre-period cash.
    const periodStart = dateAxis[0]?.datetime ?? 0;
    const realizedInPeriod = realizedRows.filter(
      (r) => new Date(r.filled_at).getTime() >= periodStart,
    );
    const realizedInPeriodTotal = realizedInPeriod.reduce((s, r) => s + r.gain_loss, 0);
    const startingValue = Math.max(
      liquidationValue - realizedInPeriodTotal - currentUnrealized,
      1, // guard against divide-by-zero
    );

    // For each datetime on the axis, compute:
    //   cumulative_realized_in_period_to_date + unrealized_at_date
    // expressed as % of startingValue.
    // Compare realized gains by day-of-trade, not exact ms, because Schwab's
    // daily candle datetime sits at the start of the day while fills land mid-session.
    const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    const candles = dateAxis.map((d) => {
      const candleDay = dayKey(d.datetime);
      const cumRealized = realizedInPeriod
        .filter((r) => dayKey(new Date(r.filled_at).getTime()) <= candleDay)
        .reduce((s, r) => s + r.gain_loss, 0);

      let unrealizedAtDate = 0;
      for (const pos of heldPositions) {
        const map = closeMapByTicker[pos.ticker];
        if (!map) continue;
        // Find the closest datetime ≤ d.datetime (lookbehind)
        let priceAt: number | null = null;
        for (let i = histByTicker[pos.ticker].length - 1; i >= 0; i--) {
          const h = histByTicker[pos.ticker][i];
          if (h.datetime <= d.datetime) { priceAt = h.close; break; }
        }
        if (priceAt == null) continue;
        unrealizedAtDate += (priceAt - pos.avgCost) * pos.qty;
      }

      const totalGain = cumRealized + unrealizedAtDate;
      const pct = (totalGain / startingValue) * 100;
      return { date: d.date, portfolio: parseFloat(pct.toFixed(2)) };
    });

    return NextResponse.json({
      ok: true,
      candles,
      meta: {
        startingValue: parseFloat(startingValue.toFixed(2)),
        totalRealized: parseFloat(totalRealized.toFixed(2)),
        realizedInPeriod: parseFloat(realizedInPeriodTotal.toFixed(2)),
        currentUnrealized: parseFloat(currentUnrealized.toFixed(2)),
        liquidationValue: parseFloat(liquidationValue.toFixed(2)),
      },
    });
  } catch (err) {
    return NextResponse.json({ ok: false, candles: [], error: String(err) });
  }
}
