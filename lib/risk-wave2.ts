/**
 * Wave 2 analytics: the metrics deferred from Wave 1, computed over the live
 * book and the Fund's own NAV series.
 *
 * Structured as one pass that returns everything, because almost all of it
 * shares a single expensive input — a year of daily closes per holding — and
 * fetching that once per metric would be both slow and rate-limited.
 *
 * Two rules carried over from Wave 1 and applied throughout:
 *
 *   Nothing here fires an alert. Wave 2 §2 calls these reporting metrics, and
 *   §5 warns they "swing between green and red more or less at random" before
 *   a year of data exists. A metric that cannot be trusted to be stable must
 *   not be wired to a notification.
 *
 *   A window that cannot support a figure yields null, never a number. Every
 *   result carries its observation count so the board can say why a cell is
 *   empty instead of leaving the reader to guess.
 */
import { BENCHMARK_SYMBOL, fetchDailyCloses } from "@/lib/fmp";
import {
  align,
  correlation,
  exAnteVolatility,
  factorSplit,
  regress,
  toReturns,
  type ExAnteVolatility,
  type ReturnSeries,
} from "@/lib/risk-factor";
import type { EnrichedPosition, RiskModel } from "@/lib/risk-engine";

/** Trailing windows Wave 2 §3 names explicitly. */
export const BETA_WINDOWS = [60, 250] as const;
export type BetaWindow = (typeof BETA_WINDOWS)[number];

export type PositionBeta = {
  symbol: string;
  side: "long" | "short";
  /** Signed weight as a fraction of NAV: negative for a short. */
  weight: number;
  beta: Partial<Record<BetaWindow, number | null>>;
  /** weight × beta, in percentage points of NAV — the contribution to net beta. */
  contribution: number | null;
  observations: number;
};

export type BetaBook = {
  /** Σ w_i β_i over the whole book, per window. */
  net: Partial<Record<BetaWindow, number | null>>;
  long: Partial<Record<BetaWindow, number | null>>;
  short: Partial<Record<BetaWindow, number | null>>;
  positions: PositionBeta[];
  /** §3: "the top five beta contributors on each side". */
  topLong: PositionBeta[];
  topShort: PositionBeta[];
  /** Holdings with no usable price history, excluded from every figure above. */
  excluded: string[];
};

export type CorrelationMatrix = {
  symbols: string[];
  /** Row-major, symbols × symbols; null where a pair has no shared history. */
  rows: (number | null)[][];
  /** Mean of the off-diagonal entries — how much the book moves as one thing. */
  averagePairwise: number | null;
  observations: number;
};

export type ConcentrationView = {
  /** §3: top five positions by % of NAV. */
  top: { symbol: string; weightPct: number }[];
  /** §3: count of positions above 8% of NAV. */
  aboveThreshold: number;
  threshold: number;
  /** Share of gross exposure held by the largest five. */
  topFiveSharePct: number | null;
};

export type Wave2Analytics = {
  beta: BetaBook | null;
  correlation: CorrelationMatrix | null;
  exAnte: ExAnteVolatility | null;
  factor: ReturnType<typeof factorSplit> | null;
  concentration: ConcentrationView;
  /** Symbols priced successfully, for the "as of" line on each card. */
  pricedSymbols: string[];
  /**
   * Holdings the market-data subscription does not cover. Separated from the
   * instruments that simply cannot have an equity price series, because this
   * list is a billing decision rather than a fact about the instrument — and
   * because a beta book that silently omits half the equities would otherwise
   * look complete.
   */
  planRestricted: string[];
  asOf: string;
};

/**
 * Which holdings can carry a return series at all.
 *
 * A Treasury sits under a CUSIP the equity price feed has never heard of, an
 * option under an OSI symbol, and cash under none. Excluding them is not a
 * data gap to be papered over — a beta for a bond regressed on the S&P 500
 * would be a real number and a meaningless one. They are named in `excluded`
 * so the board can say which part of the book a figure does not cover.
 */
function priceable(p: EnrichedPosition): boolean {
  if (p.assetClass !== "Equity") return false;
  // Equity tickers are alphabetic with the occasional dot or dash class
  // suffix; a CUSIP is nine alphanumerics and would silently return nothing.
  return /^[A-Z]{1,5}([.-][A-Z])?$/.test(p.symbol);
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Builds every Wave 2 figure from one fetch of price history.
 *
 * Never throws: a market-data outage must leave the Wave 1 board intact, so
 * every failure path returns nulls that render as "unavailable" rather than
 * taking the page down.
 */
export async function computeWave2(model: RiskModel): Promise<Wave2Analytics> {
  const asOf = new Date().toISOString();
  const positions = model.positions.map((r) => r.position);
  const nav = model.nav ?? 0;

  const concentration = concentrationView(positions, nav);
  const empty: Wave2Analytics = {
    beta: null, correlation: null, exAnte: null, factor: null,
    concentration, pricedSymbols: [], planRestricted: [], asOf,
  };
  if (!process.env.FMP_API_KEY || nav <= 0) return empty;

  const candidates = positions.filter(priceable);
  const excluded = positions
    .filter((p) => !priceable(p) && p.assetClass !== "Cash")
    .map((p) => p.symbol);
  if (!candidates.length) {
    return { ...empty, beta: { net: {}, long: {}, short: {}, positions: [], topLong: [], topShort: [], excluded } };
  }

  // 250 trading days needs roughly 365 calendar days of range.
  const from = isoDaysAgo(400);
  const to = new Date().toISOString().slice(0, 10);

  let benchmarkCloses: { date: string; close: number }[] = [];
  const priced = new Map<string, ReturnSeries>();
  const planRestricted: string[] = [];
  try {
    const [bench, ...series] = await Promise.all([
      fetchDailyCloses(BENCHMARK_SYMBOL, from, to),
      ...candidates.map((p) => fetchDailyCloses(p.symbol, from, to)),
    ]);
    benchmarkCloses = bench.closes;
    candidates.forEach((p, i) => {
      const history = series[i];
      if (history?.unavailable === "plan") planRestricted.push(p.symbol);
      const r = toReturns(history?.closes ?? []);
      if (r.size >= 40) priced.set(p.symbol, r);
    });
  } catch {
    return empty;
  }
  // Without the index there is no regression to run, and a beta book computed
  // against nothing would be worse than an absent one.
  if (!benchmarkCloses.length) return { ...empty, planRestricted };

  const benchmark = toReturns(benchmarkCloses);
  const allExcluded = [
    ...excluded,
    ...candidates.filter((p) => !priced.has(p.symbol)).map((p) => p.symbol),
  ];

  const beta = betaBook(candidates.filter((p) => priced.has(p.symbol)), priced, benchmark, nav, allExcluded);
  const weights = candidates
    .filter((p) => priced.has(p.symbol))
    .map((p) => ({ symbol: p.symbol, weight: p.exposure / nav }));

  return {
    beta,
    correlation: correlationMatrix(priced),
    exAnte: exAnteVolatility(weights, priced),
    factor: portfolioFactorSplit(weights, priced, benchmark),
    concentration,
    pricedSymbols: [...priced.keys()],
    planRestricted,
    asOf,
  };
}

function betaBook(
  positions: EnrichedPosition[],
  priced: Map<string, ReturnSeries>,
  benchmark: ReturnSeries,
  nav: number,
  excluded: string[],
): BetaBook {
  const rows: PositionBeta[] = positions.map((p) => {
    const series = priced.get(p.symbol)!;
    const { x, y, dates } = align(series, benchmark);
    const beta: Partial<Record<BetaWindow, number | null>> = {};
    for (const w of BETA_WINDOWS) {
      const r = regress(y.slice(-w), x.slice(-w));
      beta[w] = r ? r.beta : null;
    }
    const weight = p.exposure / nav;
    // The 60-day figure is the one §3 calls the working measure; contribution
    // follows it so net beta and the contributor list agree.
    const b60 = beta[60];
    return {
      symbol: p.symbol,
      side: p.side,
      weight,
      beta,
      contribution: b60 == null ? null : weight * b60 * 100,
      observations: dates.length,
    };
  });

  const sum = (subset: PositionBeta[], w: BetaWindow): number | null => {
    const usable = subset.filter((r) => r.beta[w] != null);
    if (!usable.length) return null;
    return usable.reduce((s, r) => s + r.weight * (r.beta[w] as number), 0);
  };

  const longs = rows.filter((r) => r.weight >= 0);
  const shorts = rows.filter((r) => r.weight < 0);
  const byContribution = (a: PositionBeta, b: PositionBeta) =>
    Math.abs(b.contribution ?? 0) - Math.abs(a.contribution ?? 0);

  const net: BetaBook["net"] = {};
  const long: BetaBook["long"] = {};
  const short: BetaBook["short"] = {};
  for (const w of BETA_WINDOWS) {
    net[w] = sum(rows, w);
    long[w] = sum(longs, w);
    short[w] = sum(shorts, w);
  }

  return {
    net, long, short, positions: rows,
    topLong: [...longs].sort(byContribution).slice(0, 5),
    topShort: [...shorts].sort(byContribution).slice(0, 5),
    excluded,
  };
}

function correlationMatrix(priced: Map<string, ReturnSeries>): CorrelationMatrix | null {
  const symbols = [...priced.keys()].sort();
  if (symbols.length < 2) return null;

  const rows: (number | null)[][] = [];
  let sum = 0;
  let pairs = 0;
  let minObservations = Infinity;

  for (const a of symbols) {
    const row: (number | null)[] = [];
    for (const b of symbols) {
      if (a === b) { row.push(1); continue; }
      const { x, y } = align(priced.get(a)!, priced.get(b)!);
      minObservations = Math.min(minObservations, x.length);
      const c = correlation(y, x);
      row.push(c);
      // Each unordered pair counted once.
      if (c != null && a < b) { sum += c; pairs++; }
    }
    rows.push(row);
  }

  return {
    symbols,
    rows,
    averagePairwise: pairs ? sum / pairs : null,
    observations: Number.isFinite(minObservations) ? minObservations : 0,
  };
}

/**
 * The book's own return series, weighted by current holdings, regressed on the
 * index. Uses today's weights across the whole window — it answers "how would
 * the book we hold now have behaved", not "how did the book behave", which is
 * what the NAV series is for.
 */
function portfolioFactorSplit(
  weights: { symbol: string; weight: number }[],
  priced: Map<string, ReturnSeries>,
  benchmark: ReturnSeries,
): ReturnType<typeof factorSplit> | null {
  if (!weights.length) return null;
  let dates: string[] | null = null;
  for (const w of weights) {
    const own = [...priced.get(w.symbol)!.keys()];
    dates = dates === null ? own : dates.filter((d) => priced.get(w.symbol)!.has(d));
  }
  dates = (dates ?? []).sort();
  if (dates.length < 40) return null;

  const portfolio: ReturnSeries = new Map(
    dates.map((d) => [d, weights.reduce((s, w) => s + w.weight * (priced.get(w.symbol)!.get(d) ?? 0), 0)]),
  );
  return factorSplit(portfolio, benchmark);
}

/** §3 concentration view. Threshold is 8% of NAV, as the spec states. */
function concentrationView(positions: EnrichedPosition[], nav: number): ConcentrationView {
  const threshold = 8;
  const invested = positions.filter((p) => p.assetClass !== "Cash");
  const ranked = invested
    .map((p) => ({ symbol: p.symbol, weightPct: p.weightPct }))
    .sort((a, b) => b.weightPct - a.weightPct);
  const gross = invested.reduce((s, p) => s + Math.abs(p.exposure), 0);
  const topFive = ranked.slice(0, 5);
  const topFiveGross = invested
    .filter((p) => topFive.some((t) => t.symbol === p.symbol))
    .reduce((s, p) => s + Math.abs(p.exposure), 0);

  return {
    top: topFive,
    aboveThreshold: ranked.filter((r) => r.weightPct > threshold).length,
    threshold,
    topFiveSharePct: gross > 0 ? (topFiveGross / gross) * 100 : null,
  };
}

// ── Metrics that need no external price history ───────────────────────────
//
// Separated deliberately. Everything above depends on a daily close series per
// holding, which the market-data subscription does not currently cover for the
// Fund's own equities; everything below works from the broker positions and
// the stored snapshots, so it reports real numbers today.

export type SideAttribution = {
  label: string;
  /** Unrealized P&L in dollars. */
  dollars: number;
  /** As a percentage of NAV, so the sides are comparable. */
  pctOfNav: number;
};

export type Attribution = {
  bySide: SideAttribution[];
  bySector: SideAttribution[];
  totalDollars: number;
};

/**
 * Wave 2 §3: contribution from Equities long, Equities short, Alternatives
 * options, fixed income and futures, and separately by coverage sector.
 *
 * Unrealized only, and labelled as such. Realized results live in
 * `realized_gains` against trade dates, and adding the two together here would
 * double-count any position that has been partly closed — the full attribution
 * §3 ultimately wants needs the two reconciled, which is a reporting-layer job
 * rather than something to approximate in a card.
 */
export function attribution(positions: EnrichedPosition[], nav: number): Attribution {
  const pct = (d: number) => (nav > 0 ? (d / nav) * 100 : 0);

  const bucket = (p: EnrichedPosition): string => {
    if (p.assetClass === "Fixed Income") return "Fixed income";
    if (p.assetClass === "Future") return "Futures";
    if (p.assetClass === "Option") return "Alternatives options";
    if (p.team === "alternatives") return "Alternatives other";
    return p.side === "long" ? "Equities long" : "Equities short";
  };

  const roll = (key: (p: EnrichedPosition) => string): SideAttribution[] => {
    const map = new Map<string, number>();
    for (const p of positions) {
      if (p.assetClass === "Cash") continue;
      map.set(key(p), (map.get(key(p)) ?? 0) + p.unrealizedPnl);
    }
    return [...map.entries()]
      .map(([label, dollars]) => ({ label, dollars, pctOfNav: pct(dollars) }))
      .sort((a, b) => b.dollars - a.dollars);
  };

  const invested = positions.filter((p) => p.assetClass !== "Cash");
  return {
    bySide: roll(bucket),
    bySector: roll((p) => p.sector),
    totalDollars: invested.reduce((s, p) => s + p.unrealizedPnl, 0),
  };
}

export type SizeOverrun = {
  symbol: string;
  approvedPct: number;
  currentPct: number;
  /** Percentage points above the approved size. */
  overshootPts: number;
};

/**
 * Wave 2 §3: yellow when the current weight exceeds the approved size by more
 * than one percentage point.
 *
 * A position drifting past what the Committee actually signed off is a
 * different failure from breaching the 10% cap — a 4% position approved at 2%
 * has doubled without anyone approving it, and no Wave 1 limit notices.
 */
export function sizeOverruns(positions: EnrichedPosition[], tolerancePts = 1): SizeOverrun[] {
  return positions
    .map((p) => {
      const approved = p.approval?.approved_size_pct;
      if (approved == null) return null;
      const overshootPts = p.weightPct - approved;
      if (overshootPts <= tolerancePts) return null;
      return { symbol: p.symbol, approvedPct: approved, currentPct: p.weightPct, overshootPts };
    })
    .filter((r): r is SizeOverrun => r !== null)
    .sort((a, b) => b.overshootPts - a.overshootPts);
}

export type AssignmentRisk = {
  symbol: string;
  /** strike × contracts × 100, per §3. */
  cost: number;
  daysToExpiry: number;
  inTheMoney: boolean;
};

export type AssignmentExposure = {
  /** Short options in the money within the window. */
  atRisk: AssignmentRisk[];
  /** Total assignment cost across every short put, per §3's cash buffer rule. */
  totalShortPutCost: number;
  cashAvailable: number | null;
  /** Cash available minus the assignment cost. Negative means a debit balance
   *  if everything were assigned — the §5 "structural defence" this measures. */
  bufferDollars: number | null;
};

/**
 * Wave 2 §3: any short option in the money within seven days of expiry, with
 * the assignment cost shown against cash available to trade.
 *
 * The distinction that matters is short puts versus short calls: an assigned
 * put must be paid for in cash, which is what can produce the margin debit
 * IPS II.c forbids and the Decision Log flags on IRC §514 grounds. A short
 * call assigns into stock the fund may already hold.
 */
export function assignmentExposure(
  positions: EnrichedPosition[],
  cashAvailable: number | null,
  now: Date,
  windowDays = 7,
): AssignmentExposure {
  const atRisk: AssignmentRisk[] = [];
  let totalShortPutCost = 0;

  for (const p of positions) {
    const o = p.option;
    if (!o || p.side !== "short" || !o.strike || !o.expiry) continue;

    const days = Math.ceil((new Date(o.expiry).getTime() - now.getTime()) / 86_400_000);
    const cost = o.strike * p.absQuantity * (o.multiplier ?? 100);
    const isPut = String(o.putCall ?? "").toUpperCase().startsWith("P");
    if (isPut) totalShortPutCost += cost;

    const inTheMoney = isPut ? p.price < o.strike : p.price > o.strike;
    if (days <= windowDays && days >= 0 && inTheMoney) {
      atRisk.push({ symbol: p.symbol, cost, daysToExpiry: days, inTheMoney });
    }
  }

  return {
    atRisk: atRisk.sort((a, b) => a.daysToExpiry - b.daysToExpiry),
    totalShortPutCost,
    cashAvailable,
    bufferDollars: cashAvailable == null ? null : cashAvailable - totalShortPutCost,
  };
}
