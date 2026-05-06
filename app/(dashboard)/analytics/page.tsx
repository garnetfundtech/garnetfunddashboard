import { AnalyticsPageClient } from "@/components/dashboard/analytics-page-client";
import { enforceNavAccess } from "@/lib/dashboard-guard";
import { computePortfolioRiskStats } from "@/lib/compute-portfolio-risk-stats";
import { getValidTraderToken } from "@/lib/market-data";
import { getHomepageData } from "@/lib/data";

export default async function AnalyticsPage() {
  await enforceNavAccess("/analytics");

  const [{ benchmarkYtd, portfolio }, token] = await Promise.all([
    getHomepageData(),
    getValidTraderToken(),
  ]);

  let stats = null;
  if (token && portfolio?.positions?.length) {
    try {
      stats = await computePortfolioRiskStats(token, portfolio.positions);
    } catch {
      stats = null;
    }
  }

  return (
    <div className="space-y-3 pt-2">
      <h1 className="page-title">Analytics</h1>
      <AnalyticsPageClient
        portfolio={portfolio}
        stats={stats}
        benchmarkYtd={benchmarkYtd}
      />
    </div>
  );
}
