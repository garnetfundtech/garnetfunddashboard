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
  getOrdersByStatus,
  RESTING_ORDER_STATUSES,
  SCHWAB_MAX_ORDER_WINDOW_DAYS,
  getQuotes,
  getPriceHistory,
  getMarketMovers,
  getMarketHours,
  type SchwabMover,
  type PriceCandle,
} from "@/lib/schwab";
import type {
  BenchmarkCandle,
  IndexQuote,
  LivePosition,
  MarketOverview,
  MarketSession,
  Mover,
  PortfolioSummary,
} from "@/lib/types";
import { unstable_cache } from "next/cache";
import { cache } from "react";

// ── Token management ─────────────────────────────────────────────────────────

// Single-flight guard: within one server instance only one refresh network call
// runs at a time. Schwab rotates the refresh token on use, so two concurrent
// refreshes with the same token invalidate each other — the classic "Schwab
// disconnects after a while" bug. Combined with the React cache() wrapper
// (per-request dedup) and unstable_cache on the data fetchers (which limits how
// often the token is checked at all), this keeps the connection stable under load.
let refreshInFlight: Promise<string | null> | null = null;

function refreshTraderTokenSingleFlight(
  refreshToken: string,
  currentAccessToken: string,
  expiresAtMs: number,
): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const admin = createAdminClient();
    try {
      const refreshed = await refreshAccessToken(refreshToken, "trader");
      const newExpiresAt = new Date(
        Date.now() + Number(refreshed.expires_in ?? 1800) * 1000,
      ).toISOString();
      await admin
        .from("schwab_tokens")
        .update({
          access_token: refreshed.access_token,
          refresh_token: refreshed.refresh_token ?? refreshToken,
          expires_at: newExpiresAt,
          needs_reauth: false,
        })
        .eq("id", "trader");
      return refreshed.access_token as string;
    } catch (e) {
      const msg = (e instanceof Error ? e.message : "").toLowerCase();
      const invalidGrant =
        msg.includes("invalid_grant") ||
        msg.includes("invalid grant") ||
        msg.includes("refresh token");

      if (invalidGrant) {
        // Another instance may have rotated the token microseconds earlier.
        // Re-read before giving up so we don't flag a healthy connection dead.
        const { data: fresh } = await admin
          .from("schwab_tokens")
          .select("access_token, expires_at")
          .eq("id", "trader")
          .single();
        const freshExp = fresh?.expires_at ? new Date(fresh.expires_at).getTime() : 0;
        if (fresh?.access_token && freshExp > Date.now() + 60_000) {
          return fresh.access_token as string;
        }
        await admin.from("schwab_tokens").update({ needs_reauth: true }).eq("id", "trader");
        return null;
      }

      // Transient failure — keep the existing access token if it's still valid.
      if (Date.now() < expiresAtMs) return currentAccessToken;
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export async function loadValidTraderToken(): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data: tokenRow } = await admin
      .from("schwab_tokens")
      .select("*")
      .eq("id", "trader")
      .single();

    if (!tokenRow?.access_token) return null;

    const expiresAtMs = new Date(tokenRow.expires_at).getTime();
    const fiveMin = 5 * 60 * 1000;

    // Proactively refresh if expiring within 5 minutes (single-flighted).
    if (Date.now() + fiveMin >= expiresAtMs) {
      if (!tokenRow.refresh_token) return null;
      return refreshTraderTokenSingleFlight(
        tokenRow.refresh_token as string,
        tokenRow.access_token as string,
        expiresAtMs,
      );
    }

    // Token valid. If a prior transient error set needs_reauth, clear it in the
    // background without blocking the request or risking the live access token.
    if (tokenRow.needs_reauth && tokenRow.refresh_token) {
      void refreshTraderTokenSingleFlight(
        tokenRow.refresh_token as string,
        tokenRow.access_token as string,
        expiresAtMs,
      );
    }

    return tokenRow.access_token as string;
  } catch {
    return null;
  }
}

/** Request-deduplicated valid Schwab trader access token (auto-refreshing). */
export const getValidTraderToken = cache(loadValidTraderToken);

// ── Types ────────────────────────────────────────────────────────────────────
// Canonical definitions live in lib/types.ts; re-exported here for callers that
// import them alongside the fetchers.

export type {
  LivePosition,
  PortfolioSummary,
  IndexQuote,
  MarketSession,
  MarketOverview,
  BenchmarkCandle,
} from "@/lib/types";

export type BenchmarkHistory = {
  symbol: string;
  label: string;
  candles: BenchmarkCandle[];
};

// ── Portfolio data ────────────────────────────────────────────────────────────

async function loadTraderAccountHash(): Promise<string | null> {
  const token = await getValidTraderToken();
  if (!token) return null;
  try {
    const nums = await getAccountNumbers(token);
    return nums[0]?.hashValue ?? null;
  } catch {
    return null;
  }
}

/**
 * The account hash is a stable identifier — it does not change for the life of
 * the account — but resolving it costs a full round trip to Schwab, and it sat
 * on the critical path of every risk page load. Cached for a day.
 */
export const getTraderAccountHash = unstable_cache(loadTraderAccountHash, ["trader-account-hash-v1"], {
  revalidate: 86_400,
  tags: ["schwab-account"],
});

async function loadAccountOrders(days = 60) {
  const token = await loadValidTraderToken();
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

/** Recent account orders, shared across users for 60s (orders page + turnover). */
export const fetchAccountOrders = unstable_cache(loadAccountOrders, ["account-orders-v1"], {
  revalidate: 60,
  tags: ["schwab-orders"],
});

// Last successful portfolio fetch, kept in memory for this server instance.
// If Schwab drops mid-demo (or any time), the dashboard keeps showing the
// last good snapshot — stamped with its real verifiedAt — instead of going
// blank the instant one request fails. Resets on a cold start/deploy.
let lastGoodPortfolio: PortfolioSummary | null = null;

async function loadPortfolioSummary(): Promise<PortfolioSummary | null> {
  const token = await loadValidTraderToken();
  if (!token) return lastGoodPortfolio;

  try {
    const accounts = await getAccountPositions(token);
    const accountList = Array.isArray(accounts) ? accounts : [accounts];
    const first = accountList[0];
    if (!first?.securitiesAccount) return null;

    const sec = first.securitiesAccount;
    const balances = sec.currentBalances ?? sec.initialBalances ?? {};
    const aggBalance = first.aggregatedBalance ?? {};

    const cashAvailable = Number(balances.cashAvailableForTrading ?? 0);

    // Pulled as discrete fields per risk spec §3.2. Undefined stays null so a
    // broker that simply omits the field reads as "unknown" on the dashboard
    // rather than as a clean zero debit — with one exception: a CASH account
    // cannot carry a margin debit at all, so reporting zero there is a fact
    // about the account structure, not an assumption about a missing field.
    const accountType = String(sec.type ?? "").toUpperCase();
    const rawMargin = balances.marginBalance ?? aggBalance.marginBalance;
    const marginBalance =
      rawMargin != null && Number.isFinite(Number(rawMargin))
        ? Number(rawMargin)
        : accountType === "CASH"
          ? 0
          : null;
    // Schwab reports availableFunds/buyingPower only on margin accounts; a
    // cash account states the same thing as cashAvailableForTrading.
    const rawAvailable = balances.availableFunds ?? balances.buyingPower ?? balances.cashAvailableForTrading;
    const availableFunds =
      rawAvailable == null || !Number.isFinite(Number(rawAvailable)) ? null : Number(rawAvailable);
    const longMarketValue = Number(balances.longMarketValue ?? 0);
    // Schwab's liquidationValue from securitiesAccount.currentBalances sometimes
    // reflects only the long market value and omits uninvested cash. Use the
    // larger of the API value and (cash + securities) so weights and P&L % are
    // always relative to true AUM.
    const apiLiqValue = Number(aggBalance.currentLiquidationValue ?? balances.liquidationValue ?? 0);
    const liquidationValue = Math.max(apiLiqValue, cashAvailable + longMarketValue);

    const rawPositions: Record<string, unknown>[] = sec.positions ?? [];

    const positions: LivePosition[] = rawPositions
      .filter((p) => {
        const inst = p.instrument as Record<string, unknown> | undefined;
        return inst?.symbol;
      })
      .map((p) => {
        const inst = p.instrument as Record<string, unknown>;
        // Schwab reports a leg as either longQuantity or shortQuantity. For a
        // short, marketValue and the open P&L come back negative and the side
        // is derived from shortQuantity so the whole book flows through.
        const shortQty = Number(p.shortQuantity ?? 0);
        const isShort = shortQty > 0;
        const side: "long" | "short" = isShort ? "short" : "long";
        const absQty = isShort ? shortQty : Number(p.longQuantity ?? 0);
        const quantity = isShort ? -absQty : absQty;
        const avgCost = Number(p.averagePrice ?? 0);
        const marketValue = Number(p.marketValue ?? 0);
        const currentPrice = absQty > 0 ? Math.abs(marketValue) / absQty : 0;
        const unrealizedPnl = Number(
          (isShort ? p.shortOpenProfitLoss : p.longOpenProfitLoss) ?? p.longOpenProfitLoss ?? 0,
        );
        const costBasis = avgCost * absQty;
        // Negative pct = losing: for a long that's a drop from cost, for a short
        // that's the name moving against us. Both feed the kill-trigger rows.
        const unrealizedPnlPct = costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : 0;
        const dayPnl = Number(p.currentDayProfitLoss ?? 0);
        const dayPnlPct = Number(p.currentDayProfitLossPercentage ?? 0);
        // Use liquidationValue (cash + securities) as denominator so weights
        // reflect true portfolio allocation including uninvested cash. Shorts
        // carry a negative marketValue and therefore a negative weight.
        const weight = liquidationValue > 0 ? (marketValue / liquidationValue) * 100 : 0;

        // Option and bond specifics come straight off the instrument block.
        // Anything the broker does not report stays undefined rather than
        // being guessed — the risk spec forbids silent approximation, and a
        // contract multiplier we invented would misstate exposure.
        const rawMultiplier = Number(inst.optionMultiplier ?? NaN);
        const rawPutCall = inst.putCall != null ? String(inst.putCall).toUpperCase() : null;

        return {
          ticker: String(inst.symbol),
          name: String(inst.description ?? inst.symbol),
          // Schwab's field is `assetType`; `type` does not exist on the
          // instrument, so reading it silently classified every position —
          // bonds and options included — as EQUITY. The risk board tags teams
          // off this, so a Treasury was landing in the Equities book and its
          // sector cap.
          assetType: String(inst.assetType ?? inst.type ?? "EQUITY"),
          optionMultiplier: Number.isFinite(rawMultiplier) ? rawMultiplier : undefined,
          underlyingSymbol: inst.underlyingSymbol != null ? String(inst.underlyingSymbol) : undefined,
          putCall: rawPutCall === "PUT" || rawPutCall === "CALL" ? rawPutCall : undefined,
          maturityDate: inst.maturityDate != null ? String(inst.maturityDate) : undefined,
          quantity,
          avgCost,
          currentPrice,
          marketValue,
          unrealizedPnl,
          unrealizedPnlPct,
          dayPnl,
          dayPnlPct,
          weight,
          side,
        };
      });

    const unrealizedPnl = positions.reduce((s, p) => s + p.unrealizedPnl, 0);
    const dayPnl = positions.reduce((s, p) => s + p.dayPnl, 0);
    // Split the book by side so net / gross exposure is available downstream.
    const positionsLongMV = positions
      .filter((p) => p.side !== "short")
      .reduce((s, p) => s + Math.abs(p.marketValue), 0);
    const shortMarketValue = positions
      .filter((p) => p.side === "short")
      .reduce((s, p) => s + Math.abs(p.marketValue), 0);
    const grossMarketValue = positionsLongMV + shortMarketValue;
    const netMarketValue = positionsLongMV - shortMarketValue;

    // Sum all realized gains stored in Supabase (from /api/schwab/realized-gains)
    let realizedPnl = 0;
    try {
      const admin = createAdminClient();
      const { data } = await admin.from("realized_gains").select("gain_loss");
      if (data) realizedPnl = data.reduce((s, r) => s + Number(r.gain_loss ?? 0), 0);
    } catch {
      /* non-fatal — realized gains table may not exist yet */
    }

    const result: PortfolioSummary = {
      liquidationValue,
      cashAvailable,
      longMarketValue,
      shortMarketValue,
      grossMarketValue,
      netMarketValue,
      unrealizedPnl,
      realizedPnl,
      dayPnl,
      positionCount: positions.length,
      positions,
      accountNumber: String(sec.accountNumber ?? ""),
      verifiedAt: new Date().toISOString(),
      marginBalance,
      availableFunds,
    };
    lastGoodPortfolio = result;
    return result;
  } catch {
    return lastGoodPortfolio;
  }
}

/**
 * Portfolio summary, shared across all users via the Next data cache. One fund
 * account → one upstream Schwab fetch per revalidation window regardless of how
 * many people load the dashboard at once.
 */
export const fetchPortfolioSummary = unstable_cache(loadPortfolioSummary, ["portfolio-summary-v1"], {
  revalidate: 30,
  tags: ["schwab-portfolio"],
});

/**
 * Every order the risk board needs: resting ones for the stop-order check, and
 * filled ones for stop-execution detection and the trading-calendar breach.
 *
 * Status-filtered and parallel — see getOrdersByStatus for why an unfiltered
 * wide window is unusable here.
 */
async function loadRiskOrders(): Promise<unknown[] | null> {
  const token = await loadValidTraderToken();
  const accountHash = await getTraderAccountHash();
  if (!token || !accountHash) return null;
  try {
    return await getOrdersByStatus(token, accountHash, SCHWAB_MAX_ORDER_WINDOW_DAYS, [
      ...RESTING_ORDER_STATUSES,
      "FILLED",
    ]);
  } catch {
    // null, not [] — an empty array would read as "no stop exists anywhere"
    // and turn every position red.
    return null;
  }
}

export const fetchRiskOrders = unstable_cache(loadRiskOrders, ["risk-orders-v1"], {
  revalidate: 120,
  tags: ["schwab-orders"],
});

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

// Same stale-fallback pattern as portfolio: keep the last good snapshot in
// memory so a Schwab hiccup shows slightly-old indices/movers instead of a
// blank panel.
let lastGoodMarket: MarketOverview | null = null;

async function loadMarketOverview(): Promise<MarketOverview | null> {
  const token = await loadValidTraderToken();
  if (!token) return lastGoodMarket;

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

    const result: MarketOverview = {
      ...sessionInfo,
      indices,
      gainers,
      losers,
      fetchedAt: new Date().toISOString(),
    };
    lastGoodMarket = result;
    return result;
  } catch {
    return lastGoodMarket;
  }
}

/** Market overview (indices, movers, session), shared across users for 30s. */
export const fetchMarketOverview = unstable_cache(loadMarketOverview, ["market-overview-v1"], {
  revalidate: 30,
  tags: ["schwab-market"],
});

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

async function loadBenchmarkHistory(period: PeriodKey = "YTD"): Promise<BenchmarkHistory | null> {
  const token = await loadValidTraderToken();
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

/** Benchmark (SPY) history per period, shared across users for 3 min. */
export const fetchBenchmarkHistory = unstable_cache(loadBenchmarkHistory, ["benchmark-history-v1"], {
  revalidate: 180,
  tags: ["schwab-benchmark"],
});

export { PERIOD_PARAMS };
export type { PeriodKey };
