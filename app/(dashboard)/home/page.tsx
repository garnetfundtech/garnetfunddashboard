import { HoldingsTable } from "@/components/dashboard/holdings-table";
import { MarketMoversPanel } from "@/components/dashboard/market-movers-panel";
import { MetricGrid } from "@/components/dashboard/metric-grid";
import { OverviewRail } from "@/components/dashboard/overview-rail";
import { PerformanceChartClient } from "@/components/dashboard/performance-chart-client";
import { TopBar } from "@/components/dashboard/top-bar";
import { getHomepageData } from "@/lib/data";

export default async function HomePage() {
  const { portfolio, market, benchmarkYtd } = await getHomepageData();

  return (
    <div className="space-y-3">
      <TopBar />

      {/* Main grid: left (4 tiles + chart) · right (market status + indices) */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
        {/* Left column */}
        <div className="flex flex-col gap-3">
          <MetricGrid portfolio={portfolio} />
          <PerformanceChartClient initialBenchmark={benchmarkYtd} />
        </div>

        {/* Right column — full height */}
        <OverviewRail market={market} />
      </div>

      <HoldingsTable livePositions={portfolio?.positions ?? []} />

      <MarketMoversPanel
        gainers={market?.gainers ?? []}
        losers={market?.losers ?? []}
      />
    </div>
  );
}
