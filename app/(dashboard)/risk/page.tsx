import { RiskPageClient } from "@/components/dashboard/risk-page-client";
import { enforceNavAccess } from "@/lib/dashboard-guard";
import { computePortfolioRiskStats, correlationMatrixFromToken } from "@/lib/compute-portfolio-risk-stats";
import { fetchRecentForm4ForTicker } from "@/lib/edgar";
import { fetchPortfolioSummary, getValidTraderToken } from "@/lib/market-data";

export default async function RiskPage() {
  await enforceNavAccess("/risk");

  const [portfolio, token] = await Promise.all([fetchPortfolioSummary(), getValidTraderToken()]);
  const positions = portfolio?.positions ?? [];
  const hasOptions = positions.some((p) => String(p.assetType).toUpperCase().includes("OPTION"));

  let stats = null;
  let matrix = { labels: [] as string[], matrix: [] as (number | null)[][] };
  const insiderByTicker: { ticker: string; filings: Awaited<ReturnType<typeof fetchRecentForm4ForTicker>> }[] = [];

  if (token && positions.length) {
    stats = await computePortfolioRiskStats(token, positions);
    matrix = await correlationMatrixFromToken(
      token,
      positions.map((p) => p.ticker),
    );
    await Promise.all(
      positions.slice(0, 6).map(async (p) => {
        const filings = await fetchRecentForm4ForTicker(p.ticker, 8);
        insiderByTicker.push({ ticker: p.ticker, filings });
      }),
    );
  }

  return (
    <div className="space-y-3 pt-2">
      <h1 className="page-title">Risk</h1>
      <RiskPageClient
        portfolio={portfolio}
        stats={stats}
        matrix={matrix}
        insiderByTicker={insiderByTicker}
        hasOptions={hasOptions}
      />
    </div>
  );
}
