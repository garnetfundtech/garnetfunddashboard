import { HoldingsTable } from "@/components/dashboard/holdings-table";
import { MarketMoversPanel } from "@/components/dashboard/market-movers-panel";
import { MetricGrid } from "@/components/dashboard/metric-grid";
import { OverviewRail } from "@/components/dashboard/overview-rail";
import { PerformanceChartClient } from "@/components/dashboard/performance-chart-client";
import { SectorPerformance } from "@/components/dashboard/sector-performance";
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

  let riskStats: { betaVsSpy: number | null; sectorCount: number | null } | null = null;
  let enrichedPositions = portfolio?.positions ?? [];
  let etfQuotes: Record<string, SchwabQuoteResponse> | null = null;

  if (token && enrichedPositions.length) {
    const [riskResult, enriched, quotes] = await Promise.allSettled([
      computePortfolioRiskStats(token, enrichedPositions),
      enrichPositionsWithSectors(enrichedPositions),
      getQuotes(token, SECTOR_ETF_TICKERS),
    ]);
    if (riskResult.status === "fulfilled") {
      riskStats = { betaVsSpy: riskResult.value.betaVsSpy, sectorCount: riskResult.value.sectorCount };
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

  return (
    <div className="space-y-3">
      <TopBar />

      {/* Main grid: left (tiles + chart) · right (market status + indices) */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_300px] xl:min-h-[500px]">
        {/* Left column */}
        <div className="flex min-h-0 flex-col gap-3">
          <MetricGrid portfolio={portfolio} riskStats={riskStats} />
          <PerformanceChartClient initialBenchmark={benchmarkYtd} cashOnlyMode={cashOnly} />
        </div>

        {/* Right column — full height */}
        <OverviewRail market={market} />
      </div>

      <HoldingsTable livePositions={enrichedPositions} />

      <SectorPerformance positions={enrichedPositions} etfQuotes={etfQuotes} />

      <MarketMoversPanel
        gainers={market?.gainers ?? []}
        losers={market?.losers ?? []}
      />
    </div>
  );
}
