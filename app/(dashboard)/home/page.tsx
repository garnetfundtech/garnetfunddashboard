"use client";

import dynamic from "next/dynamic";
import { HoldingsTable } from "@/components/dashboard/holdings-table";
import { MetricGrid } from "@/components/dashboard/metric-grid";
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
    <div className="space-y-3">
      <MetricGrid />
      <PerformanceChart />
      <HoldingsTable rows={holdings} />
    </div>
  );
}
