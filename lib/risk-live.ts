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
  fetchPortfolioSummary,
  fetchRiskOrders,
  getValidTraderToken,
} from "@/lib/market-data";
import { getOptionGreeks, getPriceHistory } from "@/lib/schwab";
import { fetchTreasuryRate } from "@/lib/fmp";
import { enrichPositionsWithSectors } from "@/lib/compute-portfolio-risk-stats";
import { betaFromReturns, closesFromCandles, historicalVaR, simpleReturnsFromCloses } from "@/lib/portfolio-analytics";
import { defaultRiskConfig, getRiskConfig, cfg, type RiskConfig } from "@/lib/risk-config";
import { getOpenApprovals } from "@/lib/risk-approvals";
import { getEntryDates, getThetaAverage, type EntryRecord } from "@/lib/risk-history";
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
  isCommodityFuture,
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
 * How far back the order feed reaches — Schwab's own per-request maximum. A
 * resting GTC stop placed at approval can be months old, and a short window
 * would report it missing, which is the one false positive this check must
 * never produce because it notifies the President immediately.
 */
const ORDER_WINDOW_DAYS = 350;

/** Enough daily history for the §6 250-day VaR lookback, with slack. */
const PRICE_HISTORY = { periodType: "year" as const, period: 2, frequencyType: "daily" as const, frequency: 1 };

/** §4.1: theta's tier is judged on its 20-day average, not the day's reading. */
const THETA_WINDOW_DAYS = 20;

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
  futureBeta: number | null,
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
    // §6: "Futures at dollar delta beta-weighted to the S&P 500 or underlying
    // index; commodity futures at raw notional and excluded from the beta
    // weighting."
    //
    // The multiplier is never invented — without it from the broker there is
    // no notional to compute, and a guessed contract size would misstate the
    // whole Alternatives book.
    const multiplier = p.futuresMultiplier;
    if (multiplier == null || !(p.currentPrice > 0)) {
      return { exposure: p.marketValue, basis: "unavailable" };
    }
    const notional = signedQty * multiplier * p.currentPrice;

    if (isCommodityFuture(p.ticker)) {
      return { exposure: notional, basis: "raw-notional" };
    }
    if (futureBeta == null) {
      return { exposure: notional, basis: "unavailable" };
    }
    return { exposure: notional * futureBeta, basis: "beta-weighted" };
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
  entryDates: Map<string, EntryRecord>;
  futureBetas: Map<string, number>;
}): Promise<EnrichedPosition[]> {
  const { positions, nav, approvals, greeks, underlyingPrices, coverageSectors, entryDates, futureBetas } = params;

  return positions.map((p) => {
    const side = sideOf(p);
    const assetClass = assetClassOf(p.assetType);
    const approval = approvals.get(p.ticker);
    const option = assetClass === "Option" ? buildOptionDetail(p, greeks) : null;
    const underlyingPrice = option?.underlying ? (underlyingPrices.get(option.underlying) ?? null) : null;
    const { exposure, basis } = exposureOf(
      p,
      assetClass,
      option,
      underlyingPrice,
      futureBetas.get(p.ticker) ?? null,
    );

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
      entryDate: entryDates.get(p.ticker.toUpperCase())?.entryDate ?? null,
      option,
      maturityDate: p.maturityDate ?? null,
      approval: approval ?? null,
    };
  });
}

/**
 * Beta of each non-commodity future against the S&P 500, from price history —
 * the regression §6 calls for, not a stand-in.
 *
 * Any contract whose history Schwab will not serve is left out of the map, and
 * its exposure falls back to "unavailable" rather than to an assumed beta of
 * one. That distinction matters: assuming 1.0 would quietly treat an interest
 * rate future as though it moved with equities.
 *
 * Untested against a live futures position, because the fund has never held
 * one. The first future the fund buys is worth eyeballing on the board.
 */
async function computeFutureBetas(
  token: string | null,
  positions: SidedPosition[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const futures = positions.filter(
    (p) => assetClassOf(p.assetType) === "Future" && !isCommodityFuture(p.ticker),
  );
  if (!token || !futures.length) return out;

  const history = async (symbol: string) => {
    const hist = await getPriceHistory(
      token, symbol, PRICE_HISTORY.periodType, PRICE_HISTORY.period,
      PRICE_HISTORY.frequencyType, PRICE_HISTORY.frequency,
    );
    return simpleReturnsFromCloses(closesFromCandles(hist.candles ?? []));
  };

  const spy = await history("SPY").catch(() => [] as number[]);
  if (spy.length < 30) return out;

  await Promise.all(
    futures.map(async (p) => {
      try {
        const contract = await history(p.ticker);
        const n = Math.min(contract.length, spy.length);
        if (n < 30) return;
        const beta = betaFromReturns(contract.slice(-n), spy.slice(-n));
        if (beta != null && Number.isFinite(beta)) out.set(p.ticker, beta);
      } catch {
        // Left absent — exposureOf falls back to "unavailable".
      }
    }),
  );
  return out;
}

// ── VaR (§6: historical simulation, 250 days, current weights) ────────────

type VarSet = {
  fundDollars: number | null;
  fundPct: number | null;
  perSymbol: Map<string, number>;
  observations: number;
  /** Symbols with no usable price history — their VaR share stays unscored. */
  missing: string[];
  /** Share of gross exposure that a return series was actually found for. */
  coveragePct: number;
};

/**
 * How much of the book must be priced before Fund VaR means anything.
 *
 * Position VaR share divides by Fund VaR, so a book where only a sliver is
 * priced produces a denominator covering that sliver — and a $5 holding reads
 * as 100% of the fund's risk, which is a red alert about nothing. Below this
 * threshold Fund VaR is reported as unavailable and every VaR share goes
 * unscored, which is the §3 rule against silent approximation applied to the
 * denominator rather than the inputs.
 */
const MIN_VAR_COVERAGE_PCT = 80;

async function computeVar(
  token: string | null,
  positions: EnrichedPosition[],
  nav: number,
  lookbackDays: number,
): Promise<VarSet> {
  const empty: VarSet = {
    fundDollars: null, fundPct: null, perSymbol: new Map(), observations: 0, missing: [], coveragePct: 0,
  };
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
  if (observations < 30) {
    return { fundDollars: null, fundPct: null, perSymbol, observations, missing, coveragePct: 0 };
  }

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

  const grossAll = priced.reduce((sum, p) => sum + Math.abs(p.exposure), 0);
  const grossPriced = priced
    .filter((p) => seriesFor.has(p.symbol))
    .reduce((sum, p) => sum + Math.abs(p.exposure), 0);
  const coveragePct = grossAll > 0 ? (grossPriced / grossAll) * 100 : 0;

  const q = historicalVaR(portfolioReturns, 0.95);
  if (q == null || coveragePct < MIN_VAR_COVERAGE_PCT) {
    return { fundDollars: null, fundPct: null, perSymbol, observations, missing, coveragePct };
  }
  const pct = Math.abs(q) * 100;
  return { fundDollars: (pct / 100) * nav, fundPct: pct, perSymbol, observations, missing, coveragePct };
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

  // Wave 1: everything that does not need the position list. Orders in
  // particular used to wait behind the portfolio fetch and the token load for
  // no reason — nothing about an order query depends on what we hold.
  const [portfolio, token, rawOrders, approvals, navSeries, tbill, thetaAvg] = await Promise.all([
    fetchPortfolioSummary(),
    getValidTraderToken(),
    fetchRiskOrders().catch(() => null),
    getOpenApprovals(),
    getNavSeries(),
    fetchTreasuryRate(),
    getThetaAverage(THETA_WINDOW_DAYS),
  ]);

  if (!portfolio) {
    return emptyModel([
      { label: "Schwab positions & balances", ok: false, asOf: null, note: "Unreachable or token invalid." },
    ]);
  }

  const nav = portfolio.liquidationValue;

  // Wave 2: the position-dependent lookups, also concurrent with each other.
  const optionSymbols = (portfolio.positions as SidedPosition[])
    .filter((p) => assetClassOf(p.assetType) === "Option")
    .map((p) => p.ticker);

  const [withSectors, greeks, entryDates, futureBetas] = await Promise.all([
    enrichPositionsWithSectors(portfolio.positions).catch(() => null),
    token && optionSymbols.length
      ? getOptionGreeks(token, optionSymbols).catch(() => ({}))
      : Promise.resolve({}),
    getEntryDates(portfolio.positions.map((p) => p.ticker)),
    computeFutureBetas(token, portfolio.positions as SidedPosition[]).catch(() => new Map<string, number>()),
  ]);

  const positions = (withSectors ?? portfolio.positions) as SidedPosition[];

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
    entryDates,
    futureBetas,
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
  const cashSource = portfolio.availableFunds ?? portfolio.cashAvailable ?? null;
  const cashPct = cashSource != null && nav > 0 ? (cashSource / nav) * 100 : null;

  const values: MonitorValueMap = {
    "gross-exposure": exposure.grossPct,
    "net-exposure": exposure.netPct,
    "annualized-volatility": vol.value,
    "equities-allocation": exposure.equitiesPct,
    "alternatives-allocation": exposure.alternativesPct,
    "sector-concentration": topSector?.grossPct ?? null,
    "margin-debit": marginDebit,
    "cash-available": cashPct,
    // §4.1: "The IPS requirement is positive theta on average, so the tier is
    // judged on the 20-day average." The day's reading is shown underneath it
    // rather than being scored, and until the window fills this is null — an
    // unscored card, not the day passed off as the average.
    "alternatives-theta": thetaAvg.average,
    "alternatives-vega": greekTotals.netVega,
    "trading-calendar": blackoutTrades,
  };

  const details: Record<string, string | null> = {
    "alternatives-theta":
      greekTotals.netTheta != null
        ? `Today ${greekTotals.netTheta >= 0 ? "+" : "−"}$${Math.abs(Math.round(greekTotals.netTheta)).toLocaleString("en-US")}/day`
        : null,
    "sector-concentration": topSector ? `${topSector.sector} · net ${topSector.netPct.toFixed(1)}%` : null,
    "equities-allocation": `Target ${cfg(config, "equities_target") ?? 75}% · Alternatives ${exposure.alternativesPct.toFixed(1)}%`,
    "annualized-volatility": vol.value == null ? null : `${vol.observations} observations`,
    "cash-available": portfolio.availableFunds != null ? "Excess liquidity from broker" : "Cash available to trade, from broker",
    "position-var": varSet.fundDollars == null && varSet.missing.length
      ? `Unavailable: price history covers ${varSet.coveragePct.toFixed(0)}% of gross exposure (${varSet.missing.join(", ")} unpriced).`
      : null,
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
      ? `Counted at market value, not delta-adjusted or beta-weighted: ${exposure.degraded.join(", ")}.`
      : null,
    "margin-debit": portfolio.marginBalance == null ? "The broker did not report a margin balance." : null,
    "alternatives-theta": greekTotals.missing.length
      ? `Greeks unavailable for ${greekTotals.missing.join(", ")}; excluded from the total.`
      : thetaAvg.average == null && greekTotals.netTheta != null
        ? `The 20-day average needs ${THETA_WINDOW_DAYS} stored daily readings; ${thetaAvg.observations} on file. Uncoloured until the window fills.`
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
      note: orders == null ? "Unavailable — stop-order checks cannot be confirmed." : `${ORDER_WINDOW_DAYS}-day window, by status.`,
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

/**
 * Cache window for the whole board.
 *
 * §6 Data freshness: "End-of-day refresh is the minimum. Intraday refresh, if
 * available from the broker, is desirable for the stop-loss and 10% cap checks
 * only." Five minutes is far fresher than that floor, and it means only the
 * first viewer after an expiry pays the cold build — everyone else gets the
 * board in milliseconds. Every card still carries its own as-of stamp, so a
 * cached number is never mistaken for a live one, and the alerting itself does
 * not read this cache: the cron routes rebuild the model themselves.
 */
const cachedLiveRiskModel = unstable_cache(buildLiveRiskModel, ["risk-model-wave1"], {
  revalidate: 300,
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
