import type { PriceCandle } from "@/lib/schwab";

/** Daily log returns from oldest → newest */
export function logReturnsFromCloses(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const a = closes[i - 1];
    const b = closes[i];
    if (a > 0 && b > 0) out.push(Math.log(b / a));
  }
  return out;
}

export function mean(xs: number[]) {
  if (!xs.length) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

export function stdSample(xs: number[]) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

export function covariance(a: number[], b: number[]) {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const as = a.slice(-n);
  const bs = b.slice(-n);
  const ma = mean(as);
  const mb = mean(bs);
  let s = 0;
  for (let i = 0; i < n; i++) s += (as[i] - ma) * (bs[i] - mb);
  return s / (n - 1);
}

export function varianceSample(a: number[]) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1);
}

/** OLS beta of y on x (e.g. stock returns vs SPY) */
export function betaFromReturns(stock: number[], spy: number[]) {
  const n = Math.min(stock.length, spy.length);
  if (n < 10) return null;
  const ys = stock.slice(-n);
  const xs = spy.slice(-n);
  const cov = covariance(ys, xs);
  const varx = varianceSample(xs);
  if (!varx || varx === 0) return null;
  return cov / varx;
}

export function sharpeAnnualized(dailyReturns: number[], rfDaily = 0) {
  const xs = dailyReturns.map((r) => r - rfDaily);
  const sd = stdSample(xs);
  if (!sd) return null;
  const m = mean(xs);
  return (m / sd) * Math.sqrt(252);
}

export function correlation(a: number[], b: number[]) {
  const n = Math.min(a.length, b.length);
  if (n < 10) return null;
  const as = a.slice(-n);
  const bs = b.slice(-n);
  const cov = covariance(as, bs);
  const sa = Math.sqrt(varianceSample(as));
  const sb = Math.sqrt(varianceSample(bs));
  if (!sa || !sb) return null;
  return cov / (sa * sb);
}

export function closesFromCandles(candles: PriceCandle[]): number[] {
  return candles.map((c) => c.close).filter((c) => Number.isFinite(c) && c > 0);
}

// ── Phase 2 analytics primitives ────────────────────────────────────────────
// The functions below take/return SIMPLE (arithmetic) daily returns unless
// noted, e.g. 0.012 = +1.2%. Percentages returned by risk metrics are already
// scaled to percent (1.2, not 0.012) so they map straight onto the limit rows.

/** Simple daily returns from oldest → newest closes. */
export function simpleReturnsFromCloses(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const a = closes[i - 1];
    const b = closes[i];
    if (a > 0 && b > 0) out.push(b / a - 1);
  }
  return out;
}

/** Linear-interpolated percentile (p in 0..1) of a sample. */
export function percentile(xs: number[], p: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const idx = (s.length - 1) * Math.min(1, Math.max(0, p));
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return s[lo];
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

/** Annualized downside-deviation Sortino ratio (target return 0). */
export function sortinoAnnualized(dailyReturns: number[], rfDaily = 0): number | null {
  if (dailyReturns.length < 2) return null;
  const xs = dailyReturns.map((r) => r - rfDaily);
  const downside = xs.filter((r) => r < 0);
  if (!downside.length) return null;
  const dd = Math.sqrt(downside.reduce((s, r) => s + r * r, 0) / downside.length);
  if (!dd) return null;
  return (mean(xs) / dd) * Math.sqrt(252);
}

/** 1-day historical VaR at confidence c (e.g. 0.95) as a POSITIVE percent loss. */
export function historicalVaR(returns: number[], c = 0.95): number | null {
  if (returns.length < 20) return null;
  const q = percentile(returns, 1 - c);
  if (q == null) return null;
  return Math.abs(Math.min(0, q)) * 100;
}

/** 1-day historical CVaR / expected shortfall at confidence c, positive percent. */
export function historicalCVaR(returns: number[], c = 0.95): number | null {
  if (returns.length < 20) return null;
  const q = percentile(returns, 1 - c);
  if (q == null) return null;
  const tail = returns.filter((r) => r <= q);
  if (!tail.length) return null;
  return Math.abs(Math.min(0, mean(tail))) * 100;
}

/** Current and max drawdown (both negative percents) from a simple-return series. */
export function drawdownStats(returns: number[]): { current: number; max: number } | null {
  if (returns.length < 2) return null;
  let cum = 1;
  let peak = 1;
  let maxDd = 0;
  for (const r of returns) {
    cum *= 1 + r;
    if (cum > peak) peak = cum;
    const dd = peak > 0 ? cum / peak - 1 : 0;
    if (dd < maxDd) maxDd = dd;
  }
  const current = peak > 0 ? cum / peak - 1 : 0;
  return { current: current * 100, max: maxDd * 100 };
}

/** Annualized total return (percent) implied by a daily simple-return series. */
export function annualizedReturn(returns: number[]): number | null {
  if (!returns.length) return null;
  const growth = returns.reduce((g, r) => g * (1 + r), 1);
  if (growth <= 0) return null;
  return (growth ** (252 / returns.length) - 1) * 100;
}

/** Solve a small linear system A·x = b via Gaussian elimination w/ partial pivot. */
function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-12) return null;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / M[i][i]);
}

/**
 * OLS regression of y on the given factor columns (each same length as y), with
 * an intercept. Returns coefficients [intercept, b1, …] and the R². Null if
 * there aren't enough observations for the number of factors.
 */
export function olsRegression(
  y: number[],
  columns: number[][],
): { coeffs: number[]; r2: number } | null {
  const n = y.length;
  const k = columns.length + 1; // + intercept
  if (n < k + 2 || columns.some((c) => c.length !== n)) return null;

  const X: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row = [1];
    for (const col of columns) row.push(col[i]);
    X.push(row);
  }

  // Normal equations (XᵀX) β = Xᵀy
  const XtX: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
  const Xty: number[] = Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < k; a++) {
      Xty[a] += X[i][a] * y[i];
      for (let b = 0; b < k; b++) XtX[a][b] += X[i][a] * X[i][b];
    }
  }

  const coeffs = solveLinear(XtX, Xty);
  if (!coeffs) return null;

  const yMean = mean(y);
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const pred = X[i].reduce((s, xj, j) => s + xj * coeffs[j], 0);
    ssRes += (y[i] - pred) ** 2;
    ssTot += (y[i] - yMean) ** 2;
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  return { coeffs, r2 };
}

/** Single-factor alpha (daily intercept) + beta of y regressed on x. */
export function alphaBeta(y: number[], x: number[]): { alpha: number; beta: number; r2: number } | null {
  const n = Math.min(y.length, x.length);
  if (n < 12) return null;
  const res = olsRegression(y.slice(-n), [x.slice(-n)]);
  if (!res) return null;
  return { alpha: res.coeffs[0], beta: res.coeffs[1], r2: res.r2 };
}

/** Average pairwise correlation across a set of return series (within a book). */
export function averagePairwiseCorrelation(seriesList: number[][]): number | null {
  const usable = seriesList.filter((s) => s.length >= 10);
  if (usable.length < 2) return null;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < usable.length; i++) {
    for (let j = i + 1; j < usable.length; j++) {
      const c = correlation(usable[i], usable[j]);
      if (c != null && Number.isFinite(c)) {
        sum += c;
        count += 1;
      }
    }
  }
  return count ? sum / count : null;
}
