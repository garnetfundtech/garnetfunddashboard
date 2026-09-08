/**
 * Wave 2 §2 and §3: beta, the factor decomposition, and everything else that
 * needs a return series per instrument rather than one number per day.
 *
 * Why instrument prices rather than the Fund's NAV series. §8 makes the NAV
 * series authoritative for fund-level performance, and Wave 1 built it — but
 * it began on 2026-07-16 and is one observation per day, so it can support
 * neither a 60-day regression nor anything per-position. Wave 2 §2 asks for a
 * correlation matrix "across positions" and a systematic/idiosyncratic split,
 * both of which are per-instrument by definition. Those run on daily closes
 * from the market-data feed, where a 250-day window already exists today.
 *
 * The two series answer different questions and both belong on the board:
 * realized volatility from NAV is what the Fund actually experienced;
 * ex-ante volatility from instrument covariance is what the book it holds
 * right now would produce. Wave 2 §3 asks for the second "alongside realized",
 * not instead of it.
 *
 * On the factor model. Wave 2 §2 says the systematic/idiosyncratic split
 * "requires a factor model and a quant owner", and this is not that: it is the
 * single-factor market model, where the systematic share is the R² of a
 * regression on the S&P 500 and the residual is everything else. It is the
 * standard stand-in and §3 names it as one ("Stand-in for factor risk until
 * the factor model exists"), but a one-factor residual is not the same thing
 * as firm-specific risk — it also contains every systematic factor the market
 * index does not capture. Labelled as a market-model figure everywhere it is
 * shown, so nobody reads it as the multi-factor decomposition Gov. III.c
 * ultimately wants.
 */

const TRADING_DAYS = 252;

/** A daily return series keyed by trade date, so alignment is never guessed. */
export type ReturnSeries = Map<string, number>;

/** Daily simple returns from a close series, oldest first. */
export function toReturns(closes: { date: string; close: number }[]): ReturnSeries {
  const out: ReturnSeries = new Map();
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1].close;
    if (prev > 0) out.set(closes[i].date, closes[i].close / prev - 1);
  }
  return out;
}

/**
 * The two series on the dates they share, oldest first.
 *
 * Pairing on date rather than on position matters: a halted stock, a late
 * listing or a market holiday one venue observed and the other did not would
 * otherwise shift every subsequent pair by a day and quietly corrupt the beta.
 */
export function align(a: ReturnSeries, b: ReturnSeries): { x: number[]; y: number[]; dates: string[] } {
  const dates = [...a.keys()].filter((d) => b.has(d)).sort();
  return { x: dates.map((d) => b.get(d)!), y: dates.map((d) => a.get(d)!), dates };
}

export type Regression = {
  /** Slope against the benchmark: the position's beta. */
  beta: number;
  /** Intercept, as a daily return. */
  alpha: number;
  /** Share of variance the benchmark explains — the systematic share. */
  rSquared: number;
  observations: number;
};

/**
 * Ordinary least squares of `y` on `x`.
 *
 * Returns null rather than a number below `minObservations`. Wave 2 §5 warns
 * that "any regression-based figure" is noise early on, and a beta fitted to
 * a dozen points is exactly that — it would swing across the ±0.10 band on
 * its own and train everyone to ignore the alert.
 */
export function regress(y: number[], x: number[], minObservations = 40): Regression | null {
  const n = Math.min(y.length, x.length);
  if (n < minObservations) return null;

  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;

  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  // A benchmark with no variance over the window cannot explain anything.
  //
  // Tested against the series' own scale rather than against zero, because a
  // constant series does not produce an exactly-zero sum of squares in
  // floating point — sixty copies of 0.001 give about 7e-36, which is enough
  // for the division below to return a beta fitted entirely to rounding
  // noise. That number looks perfectly ordinary on a board.
  const sdX = Math.sqrt(sxx / n);
  if (sdX <= 1e-9 * (Math.abs(mx) + sdX)) return null;

  const beta = sxy / sxx;
  return {
    beta,
    alpha: my - beta * mx,
    // Undefined when the dependent series never moved; zero variance means
    // zero explained variance, not a perfect fit.
    rSquared: syy === 0 ? 0 : (sxy * sxy) / (sxx * syy),
    observations: n,
  };
}

/** Pearson correlation of two aligned series, or null when either is flat. */
export function correlation(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 2) return null;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let saa = 0, sbb = 0, sab = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma;
    const db = b[i] - mb;
    saa += da * da;
    sbb += db * db;
    sab += da * db;
  }
  // Same scale-relative test as `regress`: a series that never really moved
  // must not produce a correlation drawn from floating-point residue.
  const sdA = Math.sqrt(saa / n);
  const sdB = Math.sqrt(sbb / n);
  if (sdA <= 1e-9 * (Math.abs(ma) + sdA)) return null;
  if (sdB <= 1e-9 * (Math.abs(mb) + sdB)) return null;
  return sab / Math.sqrt(saa * sbb);
}

/** Sample covariance of two aligned series. */
export function covariance(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 2) return null;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let s = 0;
  for (let i = 0; i < n; i++) s += (a[i] - ma) * (b[i] - mb);
  return s / (n - 1);
}

export type ExAnteVolatility = {
  /** Annualized percentage of NAV, from current weights and covariance. */
  annualizedPct: number | null;
  /** Per-symbol share of total portfolio variance, summing to 1. */
  contributions: { symbol: string; sharePct: number }[];
  observations: number;
  /** Symbols with no usable price history, excluded from the calculation. */
  excluded: string[];
};

/**
 * Portfolio volatility from the covariance of what is held right now
 * [Wave 2 §3], with each holding's contribution to it.
 *
 * Weights are signed and expressed as a fraction of NAV, so a short carries a
 * negative weight and its covariance with a long correctly reduces portfolio
 * variance — which is the entire point of measuring a hedged book this way
 * rather than summing position risks.
 *
 * Contribution is the marginal contribution to variance, w_i · Σ(w_j σ_ij),
 * which sums exactly to total variance. That answers Wave 2's "Alternatives
 * contribution to portfolio volatility": whether the overlay is reducing
 * aggregate volatility as IPS II.b intends, or quietly adding to it. A
 * negative share means the holding is a net hedge.
 */
export function exAnteVolatility(
  weights: { symbol: string; weight: number }[],
  returns: Map<string, ReturnSeries>,
): ExAnteVolatility {
  const excluded = weights.filter((w) => !returns.has(w.symbol)).map((w) => w.symbol);
  const usable = weights.filter((w) => returns.has(w.symbol));
  if (usable.length === 0) {
    return { annualizedPct: null, contributions: [], observations: 0, excluded };
  }

  // One common date set across every holding, so the covariance matrix is
  // built from genuinely simultaneous observations.
  let dates: string[] | null = null;
  for (const w of usable) {
    const own = [...returns.get(w.symbol)!.keys()];
    dates = dates === null ? own : dates.filter((d) => returns.get(w.symbol)!.has(d));
  }
  dates = (dates ?? []).sort();
  if (dates.length < 40) {
    return { annualizedPct: null, contributions: [], observations: dates.length, excluded };
  }

  const series = usable.map((w) => dates!.map((d) => returns.get(w.symbol)!.get(d)!));

  const n = usable.length;
  const cov: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const c = covariance(series[i], series[j]) ?? 0;
      cov[i][j] = c;
      cov[j][i] = c;
    }
  }

  // Σ_j w_j σ_ij for each i, then w_i × that: the marginal contributions.
  const marginal = usable.map((_, i) =>
    usable.reduce((s, w, j) => s + w.weight * cov[i][j], 0),
  );
  const variance = usable.reduce((s, w, i) => s + w.weight * marginal[i], 0);
  if (!(variance > 0)) {
    return { annualizedPct: null, contributions: [], observations: dates.length, excluded };
  }

  const annualizedPct = Math.sqrt(variance) * Math.sqrt(TRADING_DAYS) * 100;
  const contributions = usable
    .map((w, i) => ({ symbol: w.symbol, sharePct: (w.weight * marginal[i]) / variance * 100 }))
    .sort((a, b) => Math.abs(b.sharePct) - Math.abs(a.sharePct));

  return { annualizedPct, contributions, observations: dates.length, excluded };
}

export type FactorSplit = {
  /** R² against the benchmark, as a percentage of return variance. */
  systematicPct: number | null;
  /** 1 − R². What the market index does not explain. */
  idiosyncraticPct: number | null;
  beta: number | null;
  observations: number;
};

/**
 * The market-model split of Wave 2 §2 / Gov. III.c: how much of the book's
 * variation the index explains, and how much it does not.
 *
 * Reported as variance shares because Gov. III.c specifies variance, and
 * because shares of variance add up while shares of standard deviation do not.
 */
export function factorSplit(portfolio: ReturnSeries, benchmark: ReturnSeries): FactorSplit {
  const { x, y } = align(portfolio, benchmark);
  const r = regress(y, x);
  if (!r) return { systematicPct: null, idiosyncraticPct: null, beta: null, observations: x.length };
  return {
    systematicPct: r.rSquared * 100,
    idiosyncraticPct: (1 - r.rSquared) * 100,
    beta: r.beta,
    observations: r.observations,
  };
}
