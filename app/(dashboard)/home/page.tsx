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

      <MetricGrid
        portfolio={portfolio}
        session={market?.session ?? "closed"}
        isOpen={market?.isOpen ?? false}
      />

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,3fr)_320px]">
        <PerformanceChartClient initialBenchmark={benchmarkYtd} />
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
