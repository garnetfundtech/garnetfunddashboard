import { HoldingsTable } from "@/components/dashboard/holdings-table";
import { MetricGrid } from "@/components/dashboard/metric-grid";
import { OverviewRail } from "@/components/dashboard/overview-rail";
import { PerformanceChartClient } from "@/components/dashboard/performance-chart-client";
import { TopBar } from "@/components/dashboard/top-bar";
import { getHoldings } from "@/lib/data";

export default async function HomePage() {
  const holdings = await getHoldings();
  return (
    <div className="space-y-3">
      <TopBar />
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,3fr)_320px]">
        <div className="space-y-3">
          <MetricGrid />
          <PerformanceChartClient />
        </div>
        <OverviewRail />
      </div>
      <HoldingsTable rows={holdings} />
    </div>
  );
}
