/**
 * Phase 2 of the Risk Alert specification: the reporting metrics.
 *
 * Cooper's framing, which governs how these are presented: "None of these fire
 * alerts or need notifications; they're coloured cells in a monthly report and
 * they exist to answer whether the process is working, not whether I need to
 * act today."
 *
 * And the caveat he attaches to the whole set: "most of these are meaningless
 * until we have a year of data. A Sharpe ratio computed on three months is
 * noise, and so is any regression-based figure. They'll swing between green
 * and red more or less at random early on."
 *
 * That is implemented rather than merely quoted. Every function here returns a
 * value together with the number of observations behind it, and returns null
 * where the sample cannot carry the statistic — a hit rate over four closed
 * trades is not a smaller hit rate, it is a meaningless one. The report layer
 * shows the observation count next to every figure, so a cell that is empty
 * says why.
 *
 * Sharpe, Sortino, realized volatility, VaR and CVaR already exist in
 * risk-nav.ts, and R² and average pairwise correlation in risk-factor.ts;
 * Phase 2 reuses those rather than growing a second implementation that could
 * drift from the one the board displays.
 */
import type { NavPoint } from "@/lib/risk-nav";
import type { EnrichedPosition } from "@/lib/risk-engine";

export type Metric = {
  value: number | null;
  observations: number;
  /** Why the value is null, when it is — shown in place of the number. */
  note: string | null;
};

const unavailable = (observations: number, note: string): Metric => ({ value: null, observations, note });
const ok = (value: number, observations: number): Metric => ({ value, observations, note: null });

/** A closed trade, as `realized_gains` records it. */
export type ClosedTrade = { ticker: string; gainLoss: number; filledAt: string };

/**
 * Calmar: annualized return over the absolute maximum drawdown.
 *
 * Deliberately strict about the window. Calmar is conventionally a three-year
 * statistic, and computing it over a few weeks divides one noisy number by
 * another — a fund with a 0.4% drawdown and a small gain produces a
 * spectacular Calmar that means nothing at all. Below a year it is withheld
 * rather than shown with a caveat, because a number on a board gets read and
 * a caveat beside it does not.
 */
export function calmar(annualizedReturnPct: number | null, maxDrawdownPct: number | null, observations: number, minObservations = 250): Metric {
  if (observations < minObservations) {
    return unavailable(observations, `needs ${minObservations} trading days, has ${observations}`);
  }
  if (annualizedReturnPct == null || maxDrawdownPct == null) return unavailable(observations, "no return or drawdown series");
  if (maxDrawdownPct >= 0) return unavailable(observations, "no drawdown yet");
  return ok(annualizedReturnPct / Math.abs(maxDrawdownPct), observations);
}

/**
 * Hit rate: the share of closed trades that made money.
 *
 * Counted on closed positions rather than on profitable days, because the
 * question is whether the selection process works, and a day is not a
 * decision. Breakeven trades count against — a trade that returned nothing
 * consumed the capital and the attention of one that might have.
 */
export function hitRate(trades: ClosedTrade[], minTrades = 20): Metric {
  if (trades.length < minTrades) {
    return unavailable(trades.length, `needs ${minTrades} closed trades, has ${trades.length}`);
  }
  const wins = trades.filter((t) => t.gainLoss > 0).length;
  return ok((wins / trades.length) * 100, trades.length);
}

/**
 * Slugging ratio: average win divided by average loss, both as magnitudes.
 *
 * The companion to hit rate, and the reason hit rate alone is misleading. A
 * book that wins 35% of the time and makes three times as much on the winners
 * is working; one that wins 70% of the time and gives it all back on the
 * losers is not. Neither number means much without the other, so both carry
 * the same trade-count minimum and the report shows them together.
 */
export function sluggingRatio(trades: ClosedTrade[], minTrades = 20): Metric {
  if (trades.length < minTrades) {
    return unavailable(trades.length, `needs ${minTrades} closed trades, has ${trades.length}`);
  }
  const wins = trades.filter((t) => t.gainLoss > 0).map((t) => t.gainLoss);
  const losses = trades.filter((t) => t.gainLoss < 0).map((t) => Math.abs(t.gainLoss));
  if (!wins.length || !losses.length) {
    return unavailable(trades.length, wins.length ? "no losing trades yet" : "no winning trades yet");
  }
  const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
  return ok(mean(wins) / mean(losses), trades.length);
}

/**
 * Turnover: traded value over the period divided by average NAV, annualized.
 *
 * Uses the one-sided convention — total value traded, buys and sells together,
 * over average NAV. The alternative convention halves it, and the two differ
 * by exactly 2×, so the choice is stated here rather than left for whoever
 * next compares this figure against a peer fund's.
 */
export function turnover(
  fills: { quantity: number; fillPrice: number; orderTime: string }[],
  navPoints: NavPoint[],
  minDays = 60,
): Metric {
  if (navPoints.length < minDays) {
    return unavailable(navPoints.length, `needs ${minDays} NAV days, has ${navPoints.length}`);
  }
  const traded = fills.reduce((s, f) => s + Math.abs(f.quantity) * f.fillPrice, 0);
  const avgNav = navPoints.reduce((s, p) => s + p.nav, 0) / navPoints.length;
  if (!(avgNav > 0)) return unavailable(navPoints.length, "no NAV");
  const years = navPoints.length / 252;
  return ok((traded / avgNav / years) * 100, navPoints.length);
}

/**
 * Effective bets: the inverse Herfindahl of the weights on one side.
 *
 * Answers how many positions the book is *really* running, as opposed to how
 * many line items it has. Ten holdings where one is 60% of the side is closer
 * to two bets than to ten, and no count of positions shows that. Computed per
 * side because a long/short book concentrating on one side while diversifying
 * the other is exactly the asymmetry this is meant to expose.
 */
export function effectiveBets(weights: number[]): Metric {
  const abs = weights.map(Math.abs).filter((w) => w > 0);
  if (abs.length === 0) return unavailable(0, "no positions on this side");
  const total = abs.reduce((s, w) => s + w, 0);
  if (!(total > 0)) return unavailable(abs.length, "no exposure on this side");
  const hhi = abs.reduce((s, w) => s + (w / total) ** 2, 0);
  return ok(1 / hhi, abs.length);
}

export type SideBets = { long: Metric; short: Metric };

/** Effective bets for each side of the book [Phase 2, "effective bets per side"]. */
export function effectiveBetsPerSide(positions: EnrichedPosition[]): SideBets {
  const invested = positions.filter((p) => p.assetClass !== "Cash");
  return {
    long: effectiveBets(invested.filter((p) => p.exposure >= 0).map((p) => p.exposure)),
    short: effectiveBets(invested.filter((p) => p.exposure < 0).map((p) => p.exposure)),
  };
}

export type AlphaSplit = {
  /** Return attributable to the long book beyond its beta-explained part. */
  longAlphaPct: number | null;
  shortAlphaPct: number | null;
  /** What the index explains — not skill, and not counted as alpha. */
  factorResiduePct: number | null;
  note: string | null;
};

/**
 * The quarterly split into long alpha, short alpha and factor residue
 * [Phase 2].
 *
 * Each side's return less what its own beta and the index return together
 * explain; the explained part is reported separately as factor residue rather
 * than being quietly folded into either side. A market-neutral book that made
 * money because the market rose has not generated alpha, and this is the
 * figure that says so.
 *
 * Returns nulls with a reason when the betas are unavailable, which they are
 * whenever the market-data subscription does not cover a holding — the whole
 * split hinges on them and half of it would be misleading.
 */
export function alphaSplit(params: {
  longReturnPct: number | null;
  shortReturnPct: number | null;
  longBeta: number | null;
  shortBeta: number | null;
  benchmarkReturnPct: number | null;
}): AlphaSplit {
  const { longReturnPct, shortReturnPct, longBeta, shortBeta, benchmarkReturnPct } = params;
  if (benchmarkReturnPct == null) {
    return { longAlphaPct: null, shortAlphaPct: null, factorResiduePct: null, note: "no benchmark return for the period" };
  }
  if (longBeta == null || shortBeta == null) {
    return { longAlphaPct: null, shortAlphaPct: null, factorResiduePct: null, note: "betas unavailable — no price history for one or more holdings" };
  }
  const longExplained = longBeta * benchmarkReturnPct;
  const shortExplained = shortBeta * benchmarkReturnPct;
  return {
    longAlphaPct: longReturnPct == null ? null : longReturnPct - longExplained,
    shortAlphaPct: shortReturnPct == null ? null : shortReturnPct - shortExplained,
    factorResiduePct: longExplained + shortExplained,
    note: null,
  };
}
