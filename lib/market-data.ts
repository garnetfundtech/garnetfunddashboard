/**
 * Server-only module. Handles auto-refreshing the Schwab trader token and
 * fetching all live market/portfolio data used by the homepage and admin panel.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import {
  refreshAccessToken,
  getAccountPositions,
  getAccountNumbers,
  getAccountOrders,
  getQuotes,
  getPriceHistory,
  getMarketMovers,
  getMarketHours,
  type SchwabMover,
  type PriceCandle,
} from "@/lib/schwab";
import type { Mover } from "@/lib/types";

// ── Token management ─────────────────────────────────────────────────────────

export async function getValidTraderToken(): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data: tokenRow } = await admin
      .from("schwab_tokens")
      .select("*")
      .eq("id", "trader")
      .single();

    if (!tokenRow?.access_token) return null;
    if (tokenRow.needs_reauth) return null;

    // Proactively refresh if expiring within 5 minutes
    const expiresAt = new Date(tokenRow.expires_at).getTime();
    const fiveMin = 5 * 60 * 1000;

    if (Date.now() + fiveMin >= expiresAt) {
      if (!tokenRow.refresh_token) return null;
      try {
        const refreshed = await refreshAccessToken(tokenRow.refresh_token, "trader");
        const newExpiresAt = new Date(
          Date.now() + Number(refreshed.expires_in ?? 1800) * 1000,
        ).toISOString();
        await admin
          .from("schwab_tokens")
          .update({
            access_token: refreshed.access_token,
            refresh_token: refreshed.refresh_token ?? tokenRow.refresh_token,
            expires_at: newExpiresAt,
            needs_reauth: false,
          })
          .eq("id", "trader");
        return refreshed.access_token as string;
      } catch {
        await admin.from("schwab_tokens").update({ needs_reauth: true }).eq("id", "trader");
        return null;
      }
    }

    return tokenRow.access_token as string;
  } catch {
    return null;
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

export type LivePosition = {
  ticker: string;
  name: string;
  assetType: string;
  quantity: number;
  avgCost: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  dayPnl: number;
  dayPnlPct: number;
  weight: number;
  /** Optional sector label when enriched (e.g. FMP) */
  sector?: string;
};

export type PortfolioSummary = {
  liquidationValue: number;
  cashAvailable: number;
  longMarketValue: number;
  unrealizedPnl: number;
  dayPnl: number;
  positionCount: number;
  positions: LivePosition[];
  accountNumber: string | null;
  verifiedAt: string;
};

export type IndexQuote = {
  symbol: string;
  label: string;
  lastPrice: number;
  change: number;
  pctChange: number;
  high: number;
  low: number;
};

export type MarketSession = "pre" | "regular" | "post" | "closed";

export type MarketOverview = {
  isOpen: boolean;
  session: MarketSession;
  sessionStart: string | null;
  sessionEnd: string | null;
  indices: IndexQuote[];
  gainers: Mover[];
  losers: Mover[];
  fetchedAt: string;
};

export type BenchmarkCandle = { date: string; value: number };

export type BenchmarkHistory = {
  symbol: string;
  label: string;
  candles: BenchmarkCandle[];
};

// ── Portfolio data ────────────────────────────────────────────────────────────

export async function getTraderAccountHash(): Promise<string | null> {
  const token = await getValidTraderToken();
  if (!token) return null;
  try {
    const nums = await getAccountNumbers(token);
    return nums[0]?.hashValue ?? null;
  } catch {
    return null;
  }
}

export async function fetchAccountOrders(days = 60) {
  const token = await getValidTraderToken();
  if (!token) return null;
  try {
    const nums = await getAccountNumbers(token);
    const hash = nums[0]?.hashValue;
    if (!hash) return null;
    return await getAccountOrders(token, hash, days);
  } catch {
    return null;
  }
}

export async function fetchPortfolioSummary(): Promise<PortfolioSummary | null> {
  const token = await getValidTraderToken();
  if (!token) return null;

  try {
    const accounts = await getAccountPositions(token);
    const accountList = Array.isArray(accounts) ? accounts : [accounts];
    const first = accountList[0];
    if (!first?.securitiesAccount) return null;

    const sec = first.securitiesAccount;
    const balances = sec.currentBalances ?? sec.initialBalances ?? {};
    const aggBalance = first.aggregatedBalance ?? {};

    const liquidationValue = Number(
      aggBalance.currentLiquidationValue ?? balances.liquidationValue ?? 0,
    );
    const cashAvailable = Number(balances.cashAvailableForTrading ?? 0);
    const longMarketValue = Number(balances.longMarketValue ?? 0);

    const rawPositions: Record<string, unknown>[] = sec.positions ?? [];
    const totalMarketValue = rawPositions.reduce(
      (s: number, p: Record<string, unknown>) => s + Number(p.marketValue ?? 0),
      0,
    );

    const positions: LivePosition[] = rawPositions
      .filter((p) => {
        const inst = p.instrument as Record<string, unknown> | undefined;
        return inst?.symbol;
      })
      .map((p) => {
        const inst = p.instrument as Record<string, unknown>;
        const qty = Number(p.longQuantity ?? 0);
        const avgCost = Number(p.averagePrice ?? 0);
        const marketValue = Number(p.marketValue ?? 0);
        const currentPrice = qty > 0 ? marketValue / qty : 0;
        const unrealizedPnl = Number(p.longOpenProfitLoss ?? 0);
        const costBasis = avgCost * qty;
        const unrealizedPnlPct = costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : 0;
        const dayPnl = Number(p.currentDayProfitLoss ?? 0);
        const dayPnlPct = Number(p.currentDayProfitLossPercentage ?? 0);
        const weight = totalMarketValue > 0 ? (marketValue / totalMarketValue) * 100 : 0;

        return {
          ticker: String(inst.symbol),
          name: String(inst.description ?? inst.symbol),
          assetType: String(inst.type ?? "EQUITY"),
          quantity: qty,
          avgCost,
          currentPrice,
          marketValue,
          unrealizedPnl,
          unrealizedPnlPct,
          dayPnl,
          dayPnlPct,
          weight,
        };
      });

    const unrealizedPnl = positions.reduce((s, p) => s + p.unrealizedPnl, 0);
    const dayPnl = positions.reduce((s, p) => s + p.dayPnl, 0);

    return {
      liquidationValue,
      cashAvailable,
      longMarketValue,
      unrealizedPnl,
      dayPnl,
      positionCount: positions.length,
      positions,
      accountNumber: String(sec.accountNumber ?? ""),
      verifiedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

// ── Market overview ───────────────────────────────────────────────────────────

const INDEX_SYMBOLS = [
  { symbol: "SPY", label: "S&P 500" },
  { symbol: "QQQ", label: "Nasdaq 100" },
  { symbol: "IWM", label: "Russell 2000" },
];

function detectSession(marketData: Record<string, Record<string, {
  isOpen: boolean;
  sessionHours?: {
    regularMarket?: { start: string; end: string }[];
    preMarket?: { start: string; end: string }[];
    postMarket?: { start: string; end: string }[];
  };
}>>): { isOpen: boolean; session: MarketSession; start: string | null; end: string | null; sessionStart: string | null; sessionEnd: string | null } {
  const eq = marketData?.equity?.EQ ?? marketData?.equity?.equity;
  if (!eq) return { isOpen: false, session: "closed", start: null, end: null, sessionStart: null, sessionEnd: null };

  const now = new Date();
  const hours = eq.sessionHours;

  const inWindow = (windows?: { start: string; end: string }[]) => {
    if (!windows?.length) return false;
    const { start, end } = windows[0];
    return now >= new Date(start) && now < new Date(end);
  };

  if (inWindow(hours?.regularMarket)) {
    const start = hours?.regularMarket?.[0]?.start ?? null;
    const end = hours?.regularMarket?.[0]?.end ?? null;
    return { isOpen: true, session: "regular", start, end, sessionStart: start, sessionEnd: end };
  }
  if (inWindow(hours?.preMarket)) {
    const start = hours?.preMarket?.[0]?.start ?? null;
    const end = hours?.preMarket?.[0]?.end ?? null;
    return { isOpen: true, session: "pre", start, end, sessionStart: start, sessionEnd: end };
  }
  if (inWindow(hours?.postMarket)) {
    const start = hours?.postMarket?.[0]?.start ?? null;
    const end = hours?.postMarket?.[0]?.end ?? null;
    return { isOpen: true, session: "post", start, end, sessionStart: start, sessionEnd: end };
  }
  return { isOpen: false, session: "closed", start: null, end: null, sessionStart: null, sessionEnd: null };
}

/** Normalize a raw SchwabMover → Mover with correct field names and percentage scaling */
function normalizeMover(raw: SchwabMover): Mover {
  return {
    symbol: raw.symbol,
    description: raw.description,
    lastPrice: raw.lastPrice,
    change: raw.netChange,
    // netPercentChange is a decimal ratio (0.1682 = 16.82%) — multiply × 100
    percentChange: (raw.netPercentChange ?? 0) * 100,
    totalVolume: raw.totalVolume,
  };
}

export async function fetchMarketOverview(): Promise<MarketOverview | null> {
  const token = await getValidTraderToken();
  if (!token) return null;

  try {
    const [quotesRaw, hoursRaw, nyseUpRaw, nasdaqUpRaw, nyseDownRaw, nasdaqDownRaw] =
      await Promise.allSettled([
        getQuotes(token, INDEX_SYMBOLS.map((i) => i.symbol)),
        getMarketHours(token),
        getMarketMovers(token, "NYSE",   "PERCENT_CHANGE_UP"),
        getMarketMovers(token, "NASDAQ", "PERCENT_CHANGE_UP"),
        getMarketMovers(token, "NYSE",   "PERCENT_CHANGE_DOWN"),
        getMarketMovers(token, "NASDAQ", "PERCENT_CHANGE_DOWN"),
      ]);

    const quotes = quotesRaw.status === "fulfilled" ? quotesRaw.value : {};
    const hours = hoursRaw.status === "fulfilled" ? hoursRaw.value : {};

    // Combine NYSE + NASDAQ mover lists, normalize, deduplicate by symbol
    const rawUp = [
      ...(nyseUpRaw.status === "fulfilled"    ? nyseUpRaw.value    : []),
      ...(nasdaqUpRaw.status === "fulfilled"  ? nasdaqUpRaw.value  : []),
    ];
    const rawDown = [
      ...(nyseDownRaw.status === "fulfilled"  ? nyseDownRaw.value  : []),
      ...(nasdaqDownRaw.status === "fulfilled" ? nasdaqDownRaw.value : []),
    ];
    const seen = new Set<string>();
    const allMovers: Mover[] = [];
    for (const raw of [...rawUp, ...rawDown]) {
      if (!raw.symbol || seen.has(raw.symbol)) continue;
      seen.add(raw.symbol);
      allMovers.push(normalizeMover(raw));
    }

    // Split by actual direction of price movement
    const gainers = allMovers
      .filter((m) => (m.change ?? 0) > 0)
      .sort((a, b) => (b.percentChange ?? 0) - (a.percentChange ?? 0))
      .slice(0, 5);

    const losers = allMovers
      .filter((m) => (m.change ?? 0) < 0)
      .sort((a, b) => (a.percentChange ?? 0) - (b.percentChange ?? 0))
      .slice(0, 5);

    const indices: IndexQuote[] = INDEX_SYMBOLS.map(({ symbol, label }) => {
      const q = quotes[symbol]?.quote ?? {};
      return {
        symbol,
        label,
        lastPrice: q.lastPrice ?? q.mark ?? 0,
        change: q.netChange ?? 0,
        pctChange: q.netPercentChange ?? 0,
        high: q.highPrice ?? 0,
        low: q.lowPrice ?? 0,
      };
    });

    const sessionInfo = detectSession(hours);

    return {
      ...sessionInfo,
      indices,
      gainers,
      losers,
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

// ── Price history for benchmark chart ────────────────────────────────────────

type PeriodKey = "1D" | "1W" | "2W" | "1M" | "3M" | "6M" | "1Y" | "YTD";

const PERIOD_PARAMS: Record<PeriodKey, {
  periodType: "day" | "month" | "year" | "ytd";
  period: number;
  frequencyType: "minute" | "daily" | "weekly" | "monthly";
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

function formatCandleDate(datetime: number, period: PeriodKey): string {
  const d = new Date(datetime);
  if (period === "1D") {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  }
  if (period === "1W" || period === "2W") {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function normalizeToPctReturn(candles: PriceCandle[], period: PeriodKey): BenchmarkCandle[] {
  if (!candles.length) return [];
  const base = candles[0].close;
  return candles.map((c) => ({
    date: formatCandleDate(c.datetime, period),
    value: base > 0 ? parseFloat((((c.close - base) / base) * 100).toFixed(2)) : 0,
  }));
}

export async function fetchBenchmarkHistory(period: PeriodKey = "YTD"): Promise<BenchmarkHistory | null> {
  const token = await getValidTraderToken();
  if (!token) return null;

  try {
    const { periodType, period: p, frequencyType, frequency } = PERIOD_PARAMS[period];
    const history = await getPriceHistory(token, "SPY", periodType, p, frequencyType, frequency);
    if (history.empty || !history.candles?.length) return null;

    return {
      symbol: "SPY",
      label: "S&P 500 (SPY)",
      candles: normalizeToPctReturn(history.candles, period),
    };
  } catch {
    return null;
  }
}

export { PERIOD_PARAMS };
export type { PeriodKey };
