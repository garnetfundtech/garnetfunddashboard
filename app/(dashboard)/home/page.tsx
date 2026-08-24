import { HoldingsTable } from "@/components/dashboard/holdings-table";
import { PageHeader } from "@/components/dashboard/page-header";
import { KpiStrip } from "@/components/dashboard/kpi-strip";
import { RiskPanel } from "@/components/dashboard/risk-panel";
import { SectorExposure } from "@/components/dashboard/sector-exposure";
import { OverviewRail } from "@/components/dashboard/overview-rail";
import { PerformanceChartClient } from "@/components/dashboard/performance-chart-client";
import { getHomepageData } from "@/lib/data";
import { getCachedHomeRiskStats, enrichPositionsWithSectors } from "@/lib/compute-portfolio-risk-stats";
import { getFirstBuyDates } from "@/lib/order-history";

export default async function HomePage() {
  const { portfolio, market, benchmarkYtd, fundYtdPct } = await getHomepageData();

  let riskStats: { betaVsSpy: number | null; sectorCount: number | null; sharpe30?: number | null; sharpe90?: number | null } | null = null;
  let enrichedPositions = portfolio?.positions ?? [];

  if (enrichedPositions.length) {
    // Cached risk stats (shared across users/tabs) run alongside sector enrichment.
    const [riskResult, enriched] = await Promise.allSettled([
      getCachedHomeRiskStats(),
      enrichPositionsWithSectors(enrichedPositions),
    ]);
    if (riskResult.status === "fulfilled" && riskResult.value) {
      riskStats = {
        betaVsSpy: riskResult.value.betaVsSpy,
        sectorCount: riskResult.value.sectorCount,
        sharpe30: riskResult.value.sharpe30 ?? null,
        sharpe90: riskResult.value.sharpe90 ?? null,
      };
    }
    if (enriched.status === "fulfilled") {
      enrichedPositions = enriched.value;
    }
  }

  // Portfolio chart should always render — realized P&L from sold positions
  // is just as much "portfolio performance" as currently-held unrealized P&L.
  const cashOnly = false;
  const benchmarkSpark = benchmarkYtd.map((c) => c.value);
  const purchaseDates = await getFirstBuyDates(enrichedPositions.map((p) => p.ticker)).catch(() => ({}));

  return (
    <div className="flex h-full flex-col gap-3">
      <PageHeader title="Home" />
      <KpiStrip portfolio={portfolio} benchmarkSpark={benchmarkSpark} riskStats={riskStats} fundYtdPct={fundYtdPct} />

      {/* Row 2: Chart, indices, risk rail. Fixed 286px. */}
      <div
        className="grid shrink-0 gap-3"
        style={{ gridTemplateColumns: "minmax(0, 1.55fr) 188px 188px", height: "286px", gridTemplateRows: "minmax(0, 1fr)" }}
      >
        <PerformanceChartClient initialBenchmark={benchmarkYtd} cashOnlyMode={cashOnly} />
        <OverviewRail market={market} />
        <RiskPanel
          betaVsSpy={riskStats?.betaVsSpy ?? null}
          sharpe30={riskStats?.sharpe30 ?? null}
          sharpe90={riskStats?.sharpe90 ?? null}
          sectorCount={riskStats?.sectorCount ?? null}
          positions={enrichedPositions}
        />
      </div>

      {/* Row 3: Holdings + Sector Exposure — fills remaining height */}
      <div
        className="grid min-h-0 flex-1 gap-3"
        style={{ gridTemplateColumns: "minmax(0, 1.55fr) minmax(200px, 0.45fr)" }}
      >
        <HoldingsTable livePositions={enrichedPositions} purchaseDates={purchaseDates} />
        <SectorExposure positions={enrichedPositions} portfolioValue={portfolio?.liquidationValue ?? null} />
      </div>
    </div>
  );
}
