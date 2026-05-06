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
