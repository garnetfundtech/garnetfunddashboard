/**
 * Server-side risk analytics (Phase 2).
 *
 * Synthesizes the current book's daily return series from each position's price
 * history (signed by side) plus factor-ETF proxies, then derives everything the
 * "planned" limit rows needed: VaR/CVaR, realized vol, Sharpe, Sortino, R²,
 * drawdown/Calmar, size/value/momentum loadings, per-side alpha, within-book
 * correlations, per-position betas, and the stress scenarios.
 *
 * This is a marginal-risk view of the CURRENT portfolio (no stored history
 * required), so it works the day shorts are added. Price-history fetches are
 * data-cached (see lib/schwab.ts), so it's cheap under load.
 */
import { getPriceHistory } from "@/lib/schwab";
import {
  alphaBeta,
  annualizedReturn,
  averagePairwiseCorrelation,
  closesFromCandles,
  drawdownStats,
  historicalCVaR,
  historicalVaR,
  olsRegression,
  simpleReturnsFromCloses,
  sortinoAnnualized,
  stdSample,
} from "@/lib/portfolio-analytics";
import { runStressTests, type StressResult } from "@/lib/risk-stress";
import { sideOf, type SidedPosition } from "@/lib/risk-engine";

const HISTORY = { periodType: "month" as const, period: 4, frequencyType: "daily" as const, frequency: 1 };
const MAX_POSITIONS = 25;

// Factor proxies: size = small − large, value = value − growth, momentum = MTUM − market.
const SPY = "SPY";
const FACTOR_ETFS = { small: "IWM", value: "IWD", growth: "IWF", momentum: "MTUM" };

export type RiskAnalytics = {
  netBeta: number | null;
  realizedVol: number | null;
  sharpe: number | null;
  sortino: number | null;
  var95: number | null;
  cvar95: number | null;
  longOnlyVar95: number | null;
  varRatio: number | null;
  r2: number | null;
  drawdownFromHigh: number | null;
  maxDrawdown: number | null;
  calmar: number | null;
  factorSize: number | null;
  factorValue: number | null;
  factorMomentum: number | null;
  longAlpha: number | null;
  shortAlpha: number | null;
  avgCorrLong: number | null;
  avgCorrShort: number | null;
  perPositionBeta: Record<string, number>;
  stress: StressResult;
  /** Number of daily observations behind the series (transparency). */
  observations: number;
};

const EMPTY: RiskAnalytics = {
  netBeta: null, realizedVol: null, sharpe: null, sortino: null, var95: null, cvar95: null,
  longOnlyVar95: null, varRatio: null, r2: null, drawdownFromHigh: null, maxDrawdown: null,
  calmar: null, factorSize: null, factorValue: null, factorMomentum: null, longAlpha: null,
  shortAlpha: null, avgCorrLong: null, avgCorrShort: null, perPositionBeta: {},
  stress: { scenarios: [], worst: null }, observations: 0,
};

function sharpeAnnualizedSimple(returns: number[]): number | null {
  const sd = stdSample(returns);
  if (!sd) return null;
  const m = returns.reduce((s, x) => s + x, 0) / returns.length;
  return (m / sd) * Math.sqrt(252);
}

export async function computeRiskAnalytics(
  accessToken: string,
  positions: SidedPosition[],
  nav: number,
): Promise<RiskAnalytics> {
  if (!accessToken || nav <= 0 || !positions.length) return EMPTY;

  const book = positions.slice(0, MAX_POSITIONS);
  const symbols = [...new Set([SPY, ...Object.values(FACTOR_ETFS), ...book.map((p) => p.ticker.toUpperCase())])];

  // Concurrent price history for every symbol.
  const histories = await Promise.all(
    symbols.map(async (sym) => {
      try {
        const h = await getPriceHistory(accessToken, sym, HISTORY.periodType, HISTORY.period, HISTORY.frequencyType, HISTORY.frequency);
        return [sym, simpleReturnsFromCloses(closesFromCandles(h.candles ?? []))] as const;
      } catch {
        return [sym, [] as number[]] as const;
      }
    }),
  );
  const returnsBy: Record<string, number[]> = Object.fromEntries(histories);

  // Align every usable series to a common recent window.
  const usable = symbols.filter((s) => (returnsBy[s]?.length ?? 0) >= 20);
  if (!usable.includes(SPY)) return { ...EMPTY, stress: runStressTests(book, nav, {}) };
  const len = Math.min(...usable.map((s) => returnsBy[s].length));
  if (len < 20) return { ...EMPTY, stress: runStressTests(book, nav, {}) };
  const slice = (s: string) => (returnsBy[s]?.length >= len ? returnsBy[s].slice(-len) : null);

  const spy = slice(SPY)!;
  const includedPositions = book.filter((p) => (returnsBy[p.ticker.toUpperCase()]?.length ?? 0) >= len);

  // Build the return series.
  const port = new Array(len).fill(0);
  const longExposure = new Array(len).fill(0); // longs at NAV weight (the "long-only book")
  const longNorm = new Array(len).fill(0); // longs normalized to long gross
  const shortNorm = new Array(len).fill(0); // shorts normalized to short gross (already negated)
  const longSeries: number[][] = [];
  const shortSeries: number[][] = [];
  const perPositionBeta: Record<string, number> = {};

  const longTotal = includedPositions.filter((p) => sideOf(p) === "long").reduce((s, p) => s + Math.abs(p.marketValue), 0);
  const shortTotal = includedPositions.filter((p) => sideOf(p) === "short").reduce((s, p) => s + Math.abs(p.marketValue), 0);

  for (const p of includedPositions) {
    const r = slice(p.ticker.toUpperCase());
    if (!r) continue;
    const navWeight = p.marketValue / nav; // signed (short negative)
    const ab = alphaBeta(r, spy);
    if (ab) perPositionBeta[p.ticker.toUpperCase()] = ab.beta;
    for (let t = 0; t < len; t++) {
      port[t] += navWeight * r[t];
      if (sideOf(p) === "long") {
        longExposure[t] += navWeight * r[t];
        if (longTotal > 0) longNorm[t] += (Math.abs(p.marketValue) / longTotal) * r[t];
      } else if (shortTotal > 0) {
        shortNorm[t] += -(Math.abs(p.marketValue) / shortTotal) * r[t];
      }
    }
    (sideOf(p) === "long" ? longSeries : shortSeries).push(r);
  }

  // Factor columns.
  const small = slice(FACTOR_ETFS.small);
  const value = slice(FACTOR_ETFS.value);
  const growth = slice(FACTOR_ETFS.growth);
  const momentum = slice(FACTOR_ETFS.momentum);
  let factorSize: number | null = null;
  let factorValue: number | null = null;
  let factorMomentum: number | null = null;
  if (small && value && growth && momentum) {
    const sizeF = small.map((v, i) => v - spy[i]);
    const valueF = value.map((v, i) => v - growth[i]);
    const momF = momentum.map((v, i) => v - spy[i]);
    const reg = olsRegression(port, [spy, sizeF, valueF, momF]);
    if (reg) {
      // coeffs: [alpha, betaMkt, size, value, momentum]
      factorSize = reg.coeffs[2];
      factorValue = reg.coeffs[3];
      factorMomentum = reg.coeffs[4];
    }
  }

  const portBeta = alphaBeta(port, spy);
  const vol = stdSample(port);
  const dd = drawdownStats(port);
  const maxDd = dd?.max ?? null;
  const annRet = annualizedReturn(port);
  const calmar = annRet != null && maxDd != null && maxDd < 0 ? annRet / Math.abs(maxDd) : null;
  const var95 = historicalVaR(port, 0.95);
  const longOnlyVar95 = longExposure.some((v) => v !== 0) ? historicalVaR(longExposure, 0.95) : null;

  const longAb = longTotal > 0 ? alphaBeta(longNorm, spy) : null;
  const shortAb = shortTotal > 0 ? alphaBeta(shortNorm, spy) : null;

  return {
    netBeta: portBeta?.beta ?? null,
    realizedVol: vol ? vol * Math.sqrt(252) * 100 : null,
    sharpe: sharpeAnnualizedSimple(port),
    sortino: sortinoAnnualized(port),
    var95,
    cvar95: historicalCVaR(port, 0.95),
    longOnlyVar95,
    varRatio: var95 != null && longOnlyVar95 && longOnlyVar95 > 0 ? var95 / longOnlyVar95 : null,
    r2: portBeta?.r2 ?? null,
    drawdownFromHigh: dd?.current ?? null,
    maxDrawdown: maxDd,
    calmar,
    factorSize,
    factorValue,
    factorMomentum,
    longAlpha: longAb ? longAb.alpha * 252 * 100 : null,
    shortAlpha: shortAb ? shortAb.alpha * 252 * 100 : null,
    avgCorrLong: averagePairwiseCorrelation(longSeries),
    avgCorrShort: averagePairwiseCorrelation(shortSeries),
    perPositionBeta,
    stress: runStressTests(book, nav, perPositionBeta),
    observations: len,
  };
}
