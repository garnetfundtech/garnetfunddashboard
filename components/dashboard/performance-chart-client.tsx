"use client";

import dynamic from "next/dynamic";
import type { BenchmarkCandle } from "@/lib/types";

const PerformanceChart = dynamic(
  () =>
    import("@/components/dashboard/performance-chart").then(
      (module) => module.PerformanceChart,
    ),
  { ssr: false },
);

export function PerformanceChartClient({
  initialBenchmark = [],
  cashOnlyMode = false,
}: {
  initialBenchmark?: BenchmarkCandle[];
  cashOnlyMode?: boolean;
}) {
  return (
    <PerformanceChart initialBenchmark={initialBenchmark} cashOnlyMode={cashOnlyMode} />
  );
}
