/**
 * Server-only bridge: live broker data → a fully evaluated Wave 1 RiskModel.
 *
 * Everything the spec calls for that a feed can supply is wired here, and
 * everything it cannot is reported as unavailable rather than filled in.
 * §3: "If the brokerage feed cannot supply a field, the developer should
 * identify it so the Risk Manager can decide whether it becomes a manual entry
 * field or is deferred. Fields must not be silently approximated."
 *
 * What that means in practice, per feed:
 *   positions, cost basis, balances .. Schwab accounts endpoint
 *   open + filled orders ............ Schwab orders endpoint, wide window so a
 *                                     GTC stop resting since last semester is
 *                                     still visible
 *   option greeks ................... Schwab quotes endpoint (`reference` +
 *                                     greeks). Contracts it omits are named,
 *                                     not summed around.
 *   sector .......................... FMP profile, mapped onto the seven IPS
 *                                     coverage sectors
 *   3-month T-bill .................. FMP treasury rates
 *   fund NAV series ................. our own nav_daily table (§8)
 *   futures beta-weighting .......... NOT AVAILABLE. No contract-delta or
 *                                     index-beta feed is wired, so a futures
 *                                     position reports exposureBasis
 *                                     "unavailable" and the gross/net/
 *                                     Alternatives cards say so.
 */
import { unstable_cache } from "next/cache";
import {
  fetchAccountOrders,
  fetchPortfolioSummary,
  loadValidTraderToken,
} from "@/lib/market-data";
import { getOptionGreeks, getPriceHistory } from "@/lib/schwab";
import { fetchTreasuryRate } from "@/lib/fmp";
import { enrichPositionsWithSectors } from "@/lib/compute-portfolio-risk-stats";
import { closesFromCandles, historicalVaR, simpleReturnsFromCloses } from "@/lib/portfolio-analytics";
import { defaultRiskConfig, getRiskConfig, cfg, type RiskConfig } from "@/lib/risk-config";
import { getOpenApprovals } from "@/lib/risk-approvals";
import {
  annualizedVolatility,
  getNavSeries,
  type NavSeries,
} from "@/lib/risk-nav";
import {
  assetClassOf,
  buildRiskModel,
  computeExposure,
  computeGreeks,
  computeSectorExposure,
  evaluatePosition,
  mapSector,
  sideOf,
  teamOf,
  type BrokerOrder,
  type DataFeed,
  type EnrichedPosition,
  type MonitorValueMap,
  type OptionDetail,
  type PositionApproval,
  type PositionRow,
  type RiskModel,
  type SidedPosition,
} from "@/lib/risk-engine";

/**
 * How far back to read orders. A resting GTC stop placed at approval can be
 * months old, and a 30-day window would report it missing — which is the one
 * false positive this check must never produce, because it notifies the
 * President immediately.
 */
const ORDER_WINDOW_DAYS = 400;

/** Enough daily history for the §6 250-day VaR lookback, with slack. */
const PRICE_HISTORY = { periodType: "year" as const, period: 2, frequencyType: "daily" as const, frequency: 1 };

/** VaR is priced per instrument; this bounds the fan-out on a large book. */
const MAX_VAR_SYMBOLS = 40;

// ── Normalisation ─────────────────────────────────────────────────────────

function normalizeOrders(raw: unknown): BrokerOrder[] | null {
  if (!Array.isArray(raw)) return null;
  const out: BrokerOrder[] = [];

  for (const order of raw as Record<string, unknown>[]) {
    const legs = (order.orderLegCollection as Record<string, unknown>[] | undefined) ?? [];
    for (const leg of legs) {
      const instrument = (leg.instrument as Record<string, unknown> | undefined) ?? {};
      const symbol = instrument.symbol;
      if (!symbol) continue;
      out.push({
        symbol: String(symbol),
        instruction: String(leg.instruction ?? ""),
        orderType: String(order.orderType ?? ""),
        status: String(order.status ?? ""),
        quantity: Number(leg.quantity ?? order.quantity ?? 0),
        filledQuantity: Number(order.filledQuantity ?? 0),
        stopPrice: order.stopPrice != null ? Number(order.stopPrice) : null,
        price: order.price != null ? Number(order.price) : null,
        duration: String(order.duration ?? ""),
        enteredAt: order.enteredTime != null ? String(order.enteredTime) : null,
        closedAt: order.closeTime != null ? String(order.closeTime) : null,
        orderId: order.orderId != null ? String(order.orderId) : null,
      });
    }
  }
  return out;
}

/**
 * Parses the OSI option symbol Schwab uses, e.g. "AAPL  260117C00150000".
 * This is a standard encoding, not an inference: the expiry and strike are
 * literally in the identifier, so reading them is not the "silent
 * approximation" §3 prohibits.
 */
export function parseOsiSymbol(symbol: string): { underlying: string; expiry: string; strike: number; putCall: "PUT" | "CALL" } | null {
  const m = /^(.{1,6}?)\s*(\d{6})([CP])(\d{8})$/.exec(symbol.trim());
  if (!m) return null;
  const [, root, yymmdd, cp, strikeRaw] = m;
  const yy = Number(yymmdd.slice(0, 2));
  const expiry = `20${String(yy).padStart(2, "0")}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;
  return {
    underlying: root.trim(),
    expiry,
    strike: Number(strikeRaw) / 1000,
    putCall: cp === "P" ? "PUT" : "CALL",
  };
}

// ── Exposure per §6 ───────────────────────────────────────────────────────

function buildOptionDetail(
  p: SidedPosition,
  greeks: Record<string, { delta: number | null; theta: number | null; vega: number | null; expiry: string | null; strike: number | null; putCall: "PUT" | "CALL" | null; multiplier: number | null }>,
): OptionDetail {
  const parsed = parseOsiSymbol(p.ticker);
  const g = greeks[p.ticker];
  const side = sideOf(p);
  const putCall = g?.putCall ?? p.putCall ?? parsed?.putCall ?? null;
  return {
    underlying: p.underlyingSymbol ?? parsed?.underlying ?? null,
    strike: g?.strike ?? parsed?.strike ?? null,
    expiry: g?.expiry ?? parsed?.expiry ?? null,
    putCall,
    delta: g?.delta ?? null,
    theta: g?.theta ?? null,
    vega: g?.vega ?? null,
    multiplier: p.optionMultiplier ?? g?.multiplier ?? 100,
    // Long premium means we paid for the optionality: a bought put or call.
    longPremium: side === "long",
  };
}

/**
 * §6 Exposure for derivatives. Options at delta × underlying × multiplier ×
 * contracts. Futures at beta-weighted dollar delta — which we have no feed
 * for, so a future reports "unavailable" and its market value is used as a
 * placeholder that the monitor cards explicitly disclaim.
 */
function exposureOf(
  p: SidedPosition,
  assetClass: ReturnType<typeof assetClassOf>,
  option: OptionDetail | null,
  underlyingPrice: number | null,
): { exposure: number; basis: EnrichedPosition["exposureBasis"] } {
  const signedQty = sideOf(p) === "short" ? -Math.abs(p.quantity) : Math.abs(p.quantity);

  if (assetClass === "Option") {
    if (option?.delta != null && underlyingPrice != null && underlyingPrice > 0) {
      return {
        exposure: option.delta * underlyingPrice * option.multiplier * signedQty,
        basis: "delta-adjusted",
      };
    }
    return { exposure: p.marketValue, basis: "unavailable" };
  }

  if (assetClass === "Future") {
    // Contract delta and the index beta both need a feed we do not have.
    return { exposure: p.marketValue, basis: "unavailable" };
  }

  return { exposure: p.marketValue, basis: "market-value" };
}

async function enrichPositions(params: {
  positions: SidedPosition[];
  nav: number;
  approvals: Map<string, PositionApproval>;
  greeks: Record<string, Awaited<ReturnType<typeof getOptionGreeks>>[string]>;
  underlyingPrices: Map<string, number>;
  coverageSectors: string[];
}): Promise<EnrichedPosition[]> {
  const { positions, nav, approvals, greeks, underlyingPrices, coverageSectors } = params;

  return positions.map((p) => {
    const side = sideOf(p);
    const assetClass = assetClassOf(p.assetType);
    const approval = approvals.get(p.ticker);
    const option = assetClass === "Option" ? buildOptionDetail(p, greeks) : null;
    const underlyingPrice = option?.underlying ? (underlyingPrices.get(option.underlying) ?? null) : null;
    const { exposure, basis } = exposureOf(p, assetClass, option, underlyingPrice);

    const absQuantity = Math.abs(p.quantity);
    const costBasis = p.avgCost * absQuantity * (option ? option.multiplier : 1);

    // Schwab's unrealizedPnlPct is already sign-corrected for shorts (a rise
    // in a shorted name comes back negative), which is exactly the §6 rule.
    const pnlVsCostPct =
      Number.isFinite(p.unrealizedPnlPct) && costBasis !== 0 ? p.unrealizedPnlPct : null;

    return {
      symbol: p.ticker,
      name: p.name,
      side,
      team: teamOf(assetClass, approval),
      assetClass,
      sector: mapSector(p.sector, coverageSectors, approval),
      quantity: p.quantity,
      absQuantity,
      price: p.currentPrice,
      avgCost: p.avgCost,
      costBasis,
      marketValue: p.marketValue,
      exposure,
      exposureBasis: basis,
      weightPct: nav > 0 ? (Math.abs(exposure) / nav) * 100 : 0,
      pnlVsCostPct,
      unrealizedPnl: p.unrealizedPnl,
      dayPnl: p.dayPnl,
      entryDate: null,
      option,
      maturityDate: p.maturityDate ?? null,
      approval: approval ?? null,
    };
  });
}

// ── VaR (§6: historical simulation, 250 days, current weights) ────────────

type VarSet = {
  fundDollars: number | null;
  fundPct: number | null;
  perSymbol: Map<string, number>;
  observations: number;
  /** Symbols with no usable price history — their VaR share stays unscored. */
  missing: string[];
};

async function computeVar(
  token: string | null,
  positions: EnrichedPosition[],
  nav: number,
  lookbackDays: number,
): Promise<VarSet> {
  const empty: VarSet = { fundDollars: null, fundPct: null, perSymbol: new Map(), observations: 0, missing: [] };
  if (!token || nav <= 0) return empty;

  const priced = positions.filter((p) => p.assetClass !== "Cash").slice(0, MAX_VAR_SYMBOLS);
  if (!priced.length) return empty;

  // Options and futures price-history is unreliable through this endpoint, so
  // the underlying is used where there is one and the contract is skipped
  // otherwise. A skipped contract shows "—" for VaR share rather than a number
  // derived from the wrong series.
  const seriesFor = new Map<string, number[]>();
  const missing: string[] = [];

  await Promise.all(
    priced.map(async (p) => {
      const symbol = p.assetClass === "Option" ? (p.option?.underlying ?? null) : p.symbol;
      if (!symbol || p.assetClass === "Future") {
        missing.push(p.symbol);
        return;
      }
      try {
        const hist = await getPriceHistory(
          token,
          symbol,
          PRICE_HISTORY.periodType,
          PRICE_HISTORY.period,
          PRICE_HISTORY.frequencyType,
          PRICE_HISTORY.frequency,
        );
        const closes = closesFromCandles(hist.candles ?? []);
        const returns = simpleReturnsFromCloses(closes).slice(-lookbackDays);
        if (returns.length < 30) {
          missing.push(p.symbol);
          return;
        }
        seriesFor.set(p.symbol, returns);
      } catch {
        missing.push(p.symbol);
      }
    }),
  );

  if (!seriesFor.size) return { ...empty, missing };

  // Standalone position VaR: the position's own dollar exposure moved by its
  // own 5th-percentile day.
  const perSymbol = new Map<string, number>();
  for (const [symbol, returns] of seriesFor) {
    const q = historicalVaR(returns, 0.95);
    const position = priced.find((p) => p.symbol === symbol);
    if (q == null || !position) continue;
    perSymbol.set(symbol, Math.abs(q) * Math.abs(position.exposure));
  }

  // Fund VaR: current weights applied to the aligned history, per §6.
  const length = Math.min(...[...seriesFor.values()].map((r) => r.length));
  const observations = Number.isFinite(length) ? length : 0;
  if (observations < 30) return { fundDollars: null, fundPct: null, perSymbol, observations, missing };

  const portfolioReturns: number[] = [];
  for (let i = 0; i < observations; i++) {
    let pnl = 0;
    for (const [symbol, returns] of seriesFor) {
      const position = priced.find((p) => p.symbol === symbol);
      if (!position) continue;
      // Signed exposure, so a short gains when the name falls.
      pnl += position.exposure * returns[returns.length - observations + i];
    }
    portfolioReturns.push(pnl / nav);
  }

  const q = historicalVaR(portfolioReturns, 0.95);
  if (q == null) return { fundDollars: null, fundPct: null, perSymbol, observations, missing };
  const pct = Math.abs(q) * 100;
  return { fundDollars: (pct / 100) * nav, fundPct: pct, perSymbol, observations, missing };
}

// ── Trading calendar (§4.1, Gov. VIII.c) ──────────────────────────────────

/**
 * Trades executed inside the summer blackout. Returns null — not zero — when
 * no blackout window is configured, so the card reads "not configured" rather
 * than issuing an all-clear nobody checked.
 */
export function countBlackoutTrades(orders: BrokerOrder[] | null, config: RiskConfig): number | null {
  if (!config.blackout || !orders) return null;
  const { start, end } = config.blackout;
  const seen = new Set<string>();
  for (const o of orders) {
    if (o.status.toUpperCase() !== "FILLED") continue;
    const when = (o.closedAt ?? o.enteredAt ?? "").slice(0, 10);
    if (!when || when < start || when > end) continue;
    if (o.orderId) seen.add(o.orderId);
    else seen.add(`${o.symbol}:${when}`);
  }
  return seen.size;
}

// ── Model assembly ────────────────────────────────────────────────────────

async function buildLiveRiskModel(): Promise<RiskModel> {
  const asOf = new Date().toISOString();
  const now = new Date();
  const config = await getRiskConfig();

  const emptyModel = (feeds: DataFeed[]): RiskModel =>
    buildRiskModel({
      asOf,
      hasLiveData: false,
      nav: null,
      navAsOf: null,
      exposure: null,
      sectors: [],
      positions: [],
      values: {},
      feeds,
      config,
    });

  const portfolio = await fetchPortfolioSummary();
  if (!portfolio) {
    return emptyModel([
      { label: "Schwab positions & balances", ok: false, asOf: null, note: "Unreachable or token invalid." },
    ]);
  }

  const nav = portfolio.liquidationValue;
  const token = await loadValidTraderToken();

  let positions = portfolio.positions as SidedPosition[];
  const withSectors = await enrichPositionsWithSectors(portfolio.positions).catch(() => null);
  if (withSectors) positions = withSectors as SidedPosition[];

  const optionSymbols = positions
    .filter((p) => assetClassOf(p.assetType) === "Option")
    .map((p) => p.ticker);

  const [rawOrders, greeks, approvals, navSeries, tbill] = await Promise.all([
    fetchAccountOrders(ORDER_WINDOW_DAYS).catch(() => null),
    token && optionSymbols.length ? getOptionGreeks(token, optionSymbols).catch(() => ({})) : Promise.resolve({}),
    getOpenApprovals(),
    getNavSeries(),
    fetchTreasuryRate(),
  ]);

  const orders = normalizeOrders(rawOrders);

  // Underlying prices, needed for delta-adjusted option exposure.
  const underlyingPrices = new Map<string, number>();
  for (const p of positions) {
    if (assetClassOf(p.assetType) !== "Option") underlyingPrices.set(p.ticker, p.currentPrice);
  }
  if (token) {
    const needed = [
      ...new Set(
        optionSymbols
          .map((s) => parseOsiSymbol(s)?.underlying)
          .filter((s): s is string => !!s && !underlyingPrices.has(s)),
      ),
    ];
    if (needed.length) {
      await Promise.all(
        needed.map(async (symbol) => {
          try {
            const hist = await getPriceHistory(token, symbol, "day", 1, "daily", 1);
            const closes = closesFromCandles(hist.candles ?? []);
            if (closes.length) underlyingPrices.set(symbol, closes[closes.length - 1]);
          } catch {
            /* left absent — the option falls back to exposureBasis "unavailable" */
          }
        }),
      );
    }
  }

  const enriched = await enrichPositions({
    positions,
    nav,
    approvals,
    greeks,
    underlyingPrices,
    coverageSectors: config.coverageSectors,
  });

  const exposure = computeExposure(enriched, nav);
  const sectors = computeSectorExposure(enriched, nav, config.coverageSectors);
  const greekTotals = computeGreeks(enriched);

  const varSet = await computeVar(token, enriched, nav, cfg(config, "var_lookback_days") ?? 250);

  const positionRows: PositionRow[] = enriched
    .filter((p) => p.assetClass !== "Cash")
    .map((p) =>
      evaluatePosition({
        position: p,
        orders,
        config,
        var95: varSet.perSymbol.get(p.symbol) ?? null,
        fundVar95: varSet.fundDollars,
        now,
      }),
    );

  // ── Portfolio-level readings ────────────────────────────────────────────
  const volWindow = cfg(config, "volatility_window_days") ?? 60;
  const vol = annualizedVolatility(navSeries.returns, volWindow);

  const topSector = sectors[0] ?? null;
  const blackoutTrades = countBlackoutTrades(orders, config);

  // A margin balance the broker reports as negative is a debit of that size.
  // Positive means a credit, which is not a breach.
  const marginDebit =
    portfolio.marginBalance == null ? null : portfolio.marginBalance < 0 ? Math.abs(portfolio.marginBalance) : 0;
  const cashPct =
    portfolio.availableFunds != null && nav > 0 ? (portfolio.availableFunds / nav) * 100 : exposure.cashPct;

  const values: MonitorValueMap = {
    "gross-exposure": exposure.grossPct,
    "net-exposure": exposure.netPct,
    "annualized-volatility": vol.value,
    "equities-allocation": exposure.equitiesPct,
    "alternatives-allocation": exposure.alternativesPct,
    "sector-concentration": topSector?.grossPct ?? null,
    "margin-debit": marginDebit,
    "cash-available": cashPct,
    // 20-day average per §4.1: the IPS requirement is positive theta on
    // average, not on any one day. With no stored theta history yet, the
    // day's reading is shown and the card says the average is not yet
    // available rather than passing the day off as the average.
    "alternatives-theta": greekTotals.netTheta,
    "alternatives-vega": greekTotals.netVega,
    "trading-calendar": blackoutTrades,
  };

  const details: Record<string, string | null> = {
    "sector-concentration": topSector ? `${topSector.sector} · net ${topSector.netPct.toFixed(1)}%` : null,
    "equities-allocation": `Target ${cfg(config, "equities_target") ?? 75}% · Alternatives ${exposure.alternativesPct.toFixed(1)}%`,
    "annualized-volatility": vol.value == null ? null : `${vol.observations} observations`,
    "cash-available": portfolio.availableFunds != null ? "Excess liquidity from broker" : "Derived from cash positions",
  };

  const degraded: Record<string, string | null> = {
    "annualized-volatility":
      vol.value == null
        ? `Needs a stored daily NAV series; ${navSeries.observations} of ${volWindow} observations on file.`
        : vol.short
          ? `Computed on ${vol.observations} of ${volWindow} trading days — the window is not yet full.`
          : null,
    "gross-exposure": exposure.degraded.length
      ? `${exposure.degraded.length} position(s) at market value, not delta-adjusted: ${exposure.degraded.join(", ")}.`
      : null,
    "net-exposure": exposure.degraded.length
      ? `${exposure.degraded.length} position(s) at market value, not delta-adjusted: ${exposure.degraded.join(", ")}.`
      : null,
    "alternatives-allocation": exposure.degraded.length
      ? "Futures are counted at market value; no beta-weighting feed is wired."
      : null,
    "margin-debit": portfolio.marginBalance == null ? "The broker did not report a margin balance." : null,
    "alternatives-theta": greekTotals.missing.length
      ? `Greeks unavailable for ${greekTotals.missing.join(", ")}; excluded from the total.`
      : greekTotals.netTheta != null
        ? "Day's reading. The 20-day average needs stored greek history and begins accruing at go-live."
        : null,
    "alternatives-vega": greekTotals.missing.length
      ? `Greeks unavailable for ${greekTotals.missing.join(", ")}; excluded from the total.`
      : null,
    "trading-calendar":
      blackoutTrades == null ? "No blackout window configured for this academic year." : null,
  };

  // ── §1 rule 2: staleness ────────────────────────────────────────────────
  const staleHours = cfg(config, "stale_hours") ?? 24;
  const feedAgeHours = (Date.now() - new Date(portfolio.verifiedAt).getTime()) / 3_600_000;
  const feedStale = feedAgeHours > staleHours;
  const staleIds = feedStale
    ? ["gross-exposure", "net-exposure", "equities-allocation", "alternatives-allocation", "sector-concentration", "margin-debit", "cash-available", "alternatives-theta", "alternatives-vega"]
    : [];

  const feeds: DataFeed[] = [
    {
      label: "Schwab positions & balances",
      ok: !feedStale,
      asOf: portfolio.verifiedAt,
      note: feedStale ? `Older than the ${staleHours}h staleness threshold.` : undefined,
    },
    {
      label: "Schwab orders",
      ok: orders != null,
      asOf: orders != null ? asOf : null,
      note: orders == null ? "Unavailable — stop-order checks cannot be confirmed." : `${ORDER_WINDOW_DAYS}-day window.`,
    },
    {
      label: "Option greeks",
      ok: optionSymbols.length === 0 || Object.keys(greeks).length > 0,
      asOf: optionSymbols.length ? asOf : null,
      note: optionSymbols.length === 0 ? "No option positions." : greekTotals.missing.length ? `Missing for ${greekTotals.missing.length} contract(s).` : undefined,
    },
    {
      label: "Fund NAV series",
      ok: navSeries.observations > 0,
      asOf: navSeries.points.at(-1)?.captured_on ?? null,
      note: `${navSeries.observations} daily observations on file.`,
    },
    {
      label: "3-month T-bill",
      ok: tbill?.month3 != null,
      asOf: tbill?.date ?? null,
      note: tbill?.month3 != null ? `${tbill.month3.toFixed(2)}% annualized` : "Unavailable.",
    },
  ];

  return buildRiskModel({
    asOf,
    hasLiveData: true,
    nav,
    navAsOf: portfolio.verifiedAt,
    exposure,
    sectors,
    positions: positionRows,
    values,
    details,
    degraded,
    staleIds,
    fundVar: { dollars: varSet.fundDollars, pct: varSet.fundPct, observations: varSet.observations },
    feeds,
    config,
  });
}

const cachedLiveRiskModel = unstable_cache(buildLiveRiskModel, ["risk-model-wave1"], {
  revalidate: 90,
  tags: ["schwab-risk"],
});

/**
 * The live Wave 1 model.
 *
 * Cached so the whole build — orders over a 400-day window, greeks, up to 40
 * price histories for VaR — runs once per window and is shared across every
 * viewer, rather than per page load.
 *
 * A hard failure returns an honest empty model. It never returns a demo book:
 * these are the figures reported to the President and the Advisory Board.
 */
export async function getRiskModel(): Promise<RiskModel> {
  try {
    return await cachedLiveRiskModel();
  } catch {
    const config = await getRiskConfig().catch(() => defaultRiskConfig());
    return buildRiskModel({
      asOf: new Date().toISOString(),
      hasLiveData: false,
      nav: null,
      navAsOf: null,
      exposure: null,
      sectors: [],
      positions: [],
      values: {},
      feeds: [{ label: "Risk model", ok: false, asOf: null, note: "Build failed." }],
      config,
    });
  }
}

// ── Daily snapshot ────────────────────────────────────────────────────────

/** One position as persisted in `risk_snapshots.positions`. */
export type SnapshotPosition = {
  symbol: string;
  side: "long" | "short";
  team: string;
  assetClass: string;
  sector: string;
  quantity: number;
  avgCost: number;
  price: number;
  marketValue: number;
  exposure: number;
  weightPct: number;
  pnlVsCostPct: number | null;
  stop: string;
  varSharePct: number | null;
};

/**
 * The day's book, position by position, for the immutable daily snapshot.
 *
 * §6 Storage: reports for the Advisory Board and the academic year may be
 * audited, so historical figures must be reproducible from stored data rather
 * than recomputed from live feeds.
 */
export function snapshotPositions(model: RiskModel): SnapshotPosition[] {
  return model.positions.map((row) => ({
    symbol: row.position.symbol,
    side: row.position.side,
    team: row.position.team,
    assetClass: row.position.assetClass,
    sector: row.position.sector,
    quantity: row.position.quantity,
    avgCost: row.position.avgCost,
    price: row.position.price,
    marketValue: row.position.marketValue,
    exposure: row.position.exposure,
    weightPct: row.position.weightPct,
    pnlVsCostPct: row.position.pnlVsCostPct,
    stop: row.stop.state,
    varSharePct: row.varSharePct,
  }));
}

export type { NavSeries };
