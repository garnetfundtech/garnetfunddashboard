"use client";

import dynamic from "next/dynamic";
import type { PortfolioSummary } from "@/lib/types";
import type { PortfolioRiskStats } from "@/lib/compute-portfolio-risk-stats";
import type { BenchmarkCandle } from "@/lib/types";
import { PerformanceChartClient } from "@/components/dashboard/performance-chart-client";

const AnalyticsCharts = dynamic(
  () => import("@/components/dashboard/analytics-charts").then((m) => m.AnalyticsCharts),
  { ssr: false, loading: () => <div className="h-[260px] animate-pulse rounded-[12px] bg-white/[0.03]" /> },
);

export function AnalyticsPageClient({
  portfolio,
  stats,
  benchmarkYtd,
}: {
  portfolio: PortfolioSummary | null;
  stats: PortfolioRiskStats | null;
  benchmarkYtd: BenchmarkCandle[];
}) {
  const positions = portfolio?.positions ?? [];
  const cashOnly = positions.length === 0;

  const sectorData = (stats?.sectors ?? []).map((s) => ({
    name: s.name,
    value: Math.round(s.weight * 10) / 10,
  }));

  const concData = [...positions]
    .sort((a, b) => b.weight - a.weight)
    .map((p) => ({ name: p.ticker, weight: Math.round(p.weight * 10) / 10 }));

  const sortedPnl = [...positions].sort((a, b) => b.unrealizedPnl - a.unrealizedPnl);
  const top = sortedPnl[0];
  const bottom = sortedPnl[sortedPnl.length - 1];

  if (cashOnly) {
    return (
      <div className="space-y-3">
        <PerformanceChartClient initialBenchmark={benchmarkYtd} cashOnlyMode />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <PerformanceChartClient initialBenchmark={benchmarkYtd} cashOnlyMode={false} />
      <AnalyticsCharts
        sectorData={sectorData}
        concData={concData}
        stats={stats}
        top={top ?? null}
        bottom={bottom !== top ? (bottom ?? null) : null}
      />
    </div>
  );
}
