import { HoldingsTable } from "@/components/dashboard/holdings-table";
import { KpiStrip } from "@/components/dashboard/kpi-strip";
import { RiskPanel } from "@/components/dashboard/risk-panel";
import { SectorExposure } from "@/components/dashboard/sector-exposure";
import { OverviewRail } from "@/components/dashboard/overview-rail";
import { PerformanceChartClient } from "@/components/dashboard/performance-chart-client";
import { TopBar } from "@/components/dashboard/top-bar";
import { getHomepageData } from "@/lib/data";
import { computePortfolioRiskStats, enrichPositionsWithSectors } from "@/lib/compute-portfolio-risk-stats";
import { getValidTraderToken } from "@/lib/market-data";
import { getQuotes } from "@/lib/schwab";
import type { SchwabQuoteResponse } from "@/lib/schwab";

const SECTOR_ETF_TICKERS = ["XLK", "XLV", "XLF", "XLY", "XLP", "XLI", "XLC", "XLE", "XLB", "XLRE", "XLU"];

export default async function HomePage() {
  const { portfolio, market, benchmarkYtd } = await getHomepageData();
  const token = await getValidTraderToken();

  let riskStats: { betaVsSpy: number | null; sectorCount: number | null; sharpe30?: number | null; sharpe90?: number | null } | null = null;
  let enrichedPositions = portfolio?.positions ?? [];
  let etfQuotes: Record<string, SchwabQuoteResponse> | null = null;

  if (token && enrichedPositions.length) {
    const [riskResult, enriched, quotes] = await Promise.allSettled([
      computePortfolioRiskStats(token, enrichedPositions),
      enrichPositionsWithSectors(enrichedPositions),
      getQuotes(token, SECTOR_ETF_TICKERS),
    ]);
    if (riskResult.status === "fulfilled") {
      riskStats = {
        betaVsSpy: riskResult.value.betaVsSpy,
        sectorCount: riskResult.value.sectorCount,
        sharpe30: (riskResult.value as { sharpe30?: number | null }).sharpe30 ?? null,
        sharpe90: (riskResult.value as { sharpe90?: number | null }).sharpe90 ?? null,
      };
    }
    if (enriched.status === "fulfilled") {
      enrichedPositions = enriched.value;
    }
    if (quotes.status === "fulfilled") {
      etfQuotes = quotes.value;
    }
  } else if (token) {
    try {
      etfQuotes = await getQuotes(token, SECTOR_ETF_TICKERS);
    } catch {
      etfQuotes = null;
    }
  }

  const cashOnly = enrichedPositions.length === 0;
  const benchmarkSpark = benchmarkYtd.map((c) => c.value);
  const lastSync = market?.fetchedAt ?? portfolio?.verifiedAt ?? null;

  void etfQuotes;

  return (
    <div className="flex h-full flex-col gap-2">
      <TopBar lastSync={lastSync} />
      <KpiStrip portfolio={portfolio} benchmarkSpark={benchmarkSpark} riskStats={riskStats} />

      {/* Row 2: Chart + Indices + Risk — fixed 286px */}
      <div
        className="grid shrink-0 gap-2"
        style={{ gridTemplateColumns: "minmax(0, 1.55fr) 188px 188px", height: "286px", gridTemplateRows: "minmax(0, 1fr)" }}
      >
        <PerformanceChartClient initialBenchmark={benchmarkYtd} cashOnlyMode={cashOnly} />
        <OverviewRail market={market} />
        <RiskPanel
          betaVsSpy={riskStats?.betaVsSpy ?? null}
          sharpe30={riskStats?.sharpe30 ?? null}
          sharpe90={riskStats?.sharpe90 ?? null}
          sectorCount={riskStats?.sectorCount ?? null}
          positions={enrichedPositions}
        />
      </div>

      {/* Row 3: Holdings + Sector Exposure — fills remaining height */}
      <div
        className="grid min-h-0 flex-1 gap-2"
        style={{ gridTemplateColumns: "minmax(0, 1.55fr) minmax(200px, 0.45fr)" }}
      >
        <HoldingsTable livePositions={enrichedPositions} />
        <SectorExposure positions={enrichedPositions} portfolioValue={portfolio?.liquidationValue ?? null} />
      </div>
    </div>
  );
}
