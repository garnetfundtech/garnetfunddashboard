import { HoldingsTable } from "@/components/dashboard/holdings-table";
import { MarketMoversPanel } from "@/components/dashboard/market-movers-panel";
import { MetricGrid } from "@/components/dashboard/metric-grid";
import { NewsFeedSection } from "@/components/dashboard/news-feed-section";
import { OverviewRail } from "@/components/dashboard/overview-rail";
import { PerformanceChartClient } from "@/components/dashboard/performance-chart-client";
import { TopBar } from "@/components/dashboard/top-bar";
import { getHomepageData, getWatchlistTickers } from "@/lib/data";
import { computePortfolioRiskStats } from "@/lib/compute-portfolio-risk-stats";
import { getValidTraderToken } from "@/lib/market-data";

export default async function HomePage() {
  const { portfolio, market, benchmarkYtd } = await getHomepageData();
  const [token, watchTickers] = await Promise.all([getValidTraderToken(), getWatchlistTickers()]);

  let riskStats: { betaVsSpy: number | null; sectorCount: number | null } | null = null;
  if (token && portfolio?.positions?.length) {
    const s = await computePortfolioRiskStats(token, portfolio.positions);
    riskStats = { betaVsSpy: s.betaVsSpy, sectorCount: s.sectorCount };
  }

  const positions = portfolio?.positions ?? [];
  const cashOnly = positions.length === 0;
  const newsTickers = [
    ...new Set([
      ...positions.map((p) => p.ticker.toUpperCase()),
      ...watchTickers.map((t) => t.toUpperCase()),
    ]),
  ].filter(Boolean);

  return (
    <div className="space-y-3">
      <TopBar />

      {/* Main grid: left (4 tiles + chart) · right (market status + indices) */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
        {/* Left column */}
        <div className="flex flex-col gap-3">
          <MetricGrid portfolio={portfolio} riskStats={riskStats} />
          <PerformanceChartClient initialBenchmark={benchmarkYtd} cashOnlyMode={cashOnly} />
        </div>

        {/* Right column — full height */}
        <OverviewRail market={market} />
      </div>

      <HoldingsTable livePositions={portfolio?.positions ?? []} />

      <MarketMoversPanel
        gainers={market?.gainers ?? []}
        losers={market?.losers ?? []}
      />

      <NewsFeedSection tickers={newsTickers} />
    </div>
  );
}
