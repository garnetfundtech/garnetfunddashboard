import { AnalyticsPageClient } from "@/components/dashboard/analytics-page-client";
import { enforceNavAccess } from "@/lib/dashboard-guard";
import { computePortfolioRiskStats } from "@/lib/compute-portfolio-risk-stats";
import { fetchBenchmarkHistory, fetchPortfolioSummary, getValidTraderToken } from "@/lib/market-data";

export default async function AnalyticsPage() {
  await enforceNavAccess("/analytics");

  const [portfolio, benchmark, token] = await Promise.all([
    fetchPortfolioSummary(),
    fetchBenchmarkHistory("YTD"),
    getValidTraderToken(),
  ]);

  let stats = null;
  if (token && portfolio?.positions?.length) {
    stats = await computePortfolioRiskStats(token, portfolio.positions);
  }

  return (
    <div className="space-y-3 pt-2">
      <h1 className="page-title">Portfolio Analytics</h1>
      <AnalyticsPageClient
        portfolio={portfolio}
        stats={stats}
        benchmarkYtd={benchmark?.candles ?? []}
      />
    </div>
  );
}
