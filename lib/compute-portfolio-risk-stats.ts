import { getPriceHistory } from "@/lib/schwab";
import type { LivePosition } from "@/lib/types";
import {
  betaFromReturns,
  closesFromCandles,
  correlation,
  logReturnsFromCloses,
  sharpeAnnualized,
} from "@/lib/portfolio-analytics";
import { fetchProfile } from "@/lib/fmp";

const HISTORY_PARAMS = {
  periodType: "month" as const,
  period: 4,
  frequencyType: "daily" as const,
  frequency: 1,
};

export type PortfolioRiskStats = {
  betaVsSpy: number | null;
  sharpe30: number | null;
  sharpe90: number | null;
  sectorCount: number;
  sectors: { name: string; weight: number }[];
};

function alignReturns(spy: number[], stock: number[]) {
  const n = Math.min(spy.length, stock.length);
  return { spy: spy.slice(-n), stock: stock.slice(-n) };
}

export async function enrichPositionsWithSectors(positions: LivePosition[]): Promise<LivePosition[]> {
  if (!process.env.FMP_API_KEY || !positions.length) return positions;
  const enriched = await Promise.all(
    positions.map(async (p) => {
      try {
        const prof = await fetchProfile(p.ticker);
        return { ...p, sector: prof?.sector ?? p.sector ?? "Unknown" };
      } catch {
        return { ...p, sector: p.sector ?? "Unknown" };
      }
    }),
  );
  return enriched;
}

export async function computePortfolioRiskStats(
  accessToken: string,
  positions: LivePosition[],
): Promise<PortfolioRiskStats> {
  if (!positions.length) {
    return { betaVsSpy: null, sharpe30: null, sharpe90: null, sectorCount: 0, sectors: [] };
  }

  const withSectors = await enrichPositionsWithSectors(positions);
  const sectorWeights = new Map<string, number>();
  for (const p of withSectors) {
    const s = p.sector ?? "Unknown";
    sectorWeights.set(s, (sectorWeights.get(s) ?? 0) + p.weight);
  }
  const sectors = [...sectorWeights.entries()].map(([name, weight]) => ({ name, weight }));

  let spyCloses: number[] = [];
  try {
    const spyHist = await getPriceHistory(
      accessToken,
      "SPY",
      HISTORY_PARAMS.periodType,
      HISTORY_PARAMS.period,
      HISTORY_PARAMS.frequencyType,
      HISTORY_PARAMS.frequency,
    );
    spyCloses = closesFromCandles(spyHist.candles ?? []);
  } catch {
    spyCloses = [];
  }
  const spyR = logReturnsFromCloses(spyCloses);

  const betas: { w: number; b: number }[] = [];
  const portfolioReturnSeries: number[][] = [];

  for (const p of withSectors.slice(0, 12)) {
    try {
      const hist = await getPriceHistory(
        accessToken,
        p.ticker,
        HISTORY_PARAMS.periodType,
        HISTORY_PARAMS.period,
        HISTORY_PARAMS.frequencyType,
        HISTORY_PARAMS.frequency,
      );
      const closes = closesFromCandles(hist.candles ?? []);
      const r = logReturnsFromCloses(closes);
      const { spy: sA, stock: rA } = alignReturns(spyR, r);
      const b = betaFromReturns(rA, sA);
      if (b != null && Number.isFinite(b)) {
        betas.push({ w: p.weight / 100, b });
      }
      if (r.length) portfolioReturnSeries.push(r);
    } catch {
      /* skip */
    }
  }

  const totalW = betas.reduce((s, x) => s + x.w, 0);
  const betaVsSpy =
    totalW > 0 ? betas.reduce((s, x) => s + (x.w / totalW) * x.b, 0) : betas[0]?.b ?? null;

  // Equal-weight average of aligned last-30 and last-90 log returns vs SPY for Sharpe on basket proxy
  let sharpe30: number | null = null;
  let sharpe90: number | null = null;
  if (portfolioReturnSeries.length && spyCloses.length) {
    const minLen = Math.min(...portfolioReturnSeries.map((s) => s.length), spyR.length);
    if (minLen > 15) {
      const avgRet: number[] = [];
      for (let i = 0; i < minLen; i++) {
        let sum = 0;
        let c = 0;
        for (const series of portfolioReturnSeries) {
          const ri = series[series.length - minLen + i];
          if (ri != null) {
            sum += ri;
            c++;
          }
        }
        avgRet.push(c ? sum / c : 0);
      }
      sharpe30 = sharpeAnnualized(avgRet.slice(-30));
      sharpe90 = sharpeAnnualized(avgRet.slice(-90));
    }
  }

  return {
    betaVsSpy,
    sharpe30,
    sharpe90,
    sectorCount: sectorWeights.size,
    sectors,
  };
}

export async function correlationMatrixFromToken(
  accessToken: string,
  tickers: string[],
): Promise<{ labels: string[]; matrix: (number | null)[][] }> {
  const uniq = [...new Set(tickers.map((t) => t.toUpperCase()))].slice(0, 10);
  const closesByTicker: Record<string, number[]> = {};

  await Promise.all(
    uniq.map(async (t) => {
      try {
        const hist = await getPriceHistory(
          accessToken,
          t,
          HISTORY_PARAMS.periodType,
          HISTORY_PARAMS.period,
          HISTORY_PARAMS.frequencyType,
          HISTORY_PARAMS.frequency,
        );
        closesByTicker[t] = closesFromCandles(hist.candles ?? []);
      } catch {
        closesByTicker[t] = [];
      }
    }),
  );

  const returnsBy: Record<string, number[]> = {};
  for (const t of uniq) {
    returnsBy[t] = logReturnsFromCloses(closesByTicker[t] ?? []);
  }

  const n = uniq.length;
  const matrix: (number | null)[][] = Array.from({ length: n }, () => Array(n).fill(null));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) matrix[i][j] = 1;
      else matrix[i][j] = correlation(returnsBy[uniq[i]]!, returnsBy[uniq[j]]!);
    }
  }

  return { labels: uniq, matrix };
}
