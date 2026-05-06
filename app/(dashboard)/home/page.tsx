"use client";

import dynamic from "next/dynamic";
import { HoldingsTable } from "@/components/dashboard/holdings-table";
import { MetricGrid } from "@/components/dashboard/metric-grid";
import { OverviewRail } from "@/components/dashboard/overview-rail";
import { TopBar } from "@/components/dashboard/top-bar";
import { holdings } from "@/lib/mock-data";

const PerformanceChart = dynamic(
  () =>
    import("@/components/dashboard/performance-chart").then(
      (module) => module.PerformanceChart,
    ),
  { ssr: false },
);

export default function HomePage() {
  return (
    <div className="space-y-3 pt-2">
      <TopBar />
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,3fr)_320px]">
        <div className="space-y-3">
          <MetricGrid />
          <PerformanceChart />
        </div>
        <OverviewRail />
      </div>
      <HoldingsTable rows={holdings} />
    </div>
  );
}
