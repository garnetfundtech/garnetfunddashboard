import { unstable_cache } from "next/cache";
import { getPriceHistory } from "@/lib/schwab";
import { fetchPortfolioSummary, loadValidTraderToken } from "@/lib/market-data";
import type { LivePosition } from "@/lib/types";
import {
  betaFromReturns,
  closesFromCandles,
  logReturnsFromCloses,
  sharpeAnnualized,
  stdSample,
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
  /** Annualized realized volatility of the basket proxy, in percent. */
  realizedVol: number | null;
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
      // Skip tickers already carrying a real sector so a second enrichment pass
      // (e.g. home page + risk stats) doesn't re-hit FMP.
      if (p.sector && p.sector !== "Unknown") return p;
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
    return { betaVsSpy: null, sharpe30: null, sharpe90: null, realizedVol: null, sectorCount: 0, sectors: [] };
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

  // Fetch every position's price history concurrently. This loop used to run
  // serially (up to 12 round-trips back-to-back), which was the single biggest
  // source of slow page loads; the underlying fetches are also data-cached now.
  const perPosition = await Promise.all(
    withSectors.slice(0, 12).map(async (p) => {
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
        return { weight: p.weight, r, b };
      } catch {
        return null;
      }
    }),
  );

  const betas: { w: number; b: number }[] = [];
  const portfolioReturnSeries: number[][] = [];
  for (const res of perPosition) {
    if (!res) continue;
    if (res.b != null && Number.isFinite(res.b)) betas.push({ w: res.weight / 100, b: res.b });
    if (res.r.length) portfolioReturnSeries.push(res.r);
  }

  const totalW = betas.reduce((s, x) => s + x.w, 0);
  const betaVsSpy =
    totalW > 0 ? betas.reduce((s, x) => s + (x.w / totalW) * x.b, 0) : betas[0]?.b ?? null;

  // Equal-weight average of aligned last-30 and last-90 log returns vs SPY for Sharpe on basket proxy
  let sharpe30: number | null = null;
  let sharpe90: number | null = null;
  let realizedVol: number | null = null;
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
      // Annualized realized vol of the basket proxy, in percent.
      const vol90 = stdSample(avgRet.slice(-90));
      realizedVol = vol90 > 0 ? vol90 * Math.sqrt(252) * 100 : null;
    }
  }

  return {
    betaVsSpy,
    sharpe30,
    sharpe90,
    realizedVol,
    sectorCount: sectorWeights.size,
    sectors,
  };
}

/**
 * Home-page risk stats (beta / Sharpe / vol / sectors), computed once per window
 * and shared across users and tab switches. Fetches token + portfolio itself so
 * the whole result is cacheable.
 */
export const getCachedHomeRiskStats = unstable_cache(
  async (): Promise<PortfolioRiskStats | null> => {
    const token = await loadValidTraderToken();
    const portfolio = await fetchPortfolioSummary();
    if (!token || !portfolio?.positions.length) return null;
    return computePortfolioRiskStats(token, portfolio.positions);
  },
  ["home-risk-stats-v1"],
  { revalidate: 300, tags: ["schwab-risk"] },
);
