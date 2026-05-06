"use client";

import dynamic from "next/dynamic";

const PerformanceChart = dynamic(
  () =>
    import("@/components/dashboard/performance-chart").then(
      (module) => module.PerformanceChart,
    ),
  { ssr: false },
);

export function PerformanceChartClient() {
  return <PerformanceChart />;
}

