import { RiskDashboard, type RiskTab } from "@/components/dashboard/risk-dashboard";
import { enforceNavAccess } from "@/lib/dashboard-guard";
import { canReadFullRiskBoard, isRiskManager } from "@/lib/nav-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchTreasuryRate } from "@/lib/fmp";
import { getRiskModel } from "@/lib/risk-live";
import type { RiskModel } from "@/lib/risk-engine";
import { getAlertLog } from "@/lib/risk-episodes";
import { getNavSeries } from "@/lib/risk-nav";
import { buildReportingModel, REPORT_PACKS, type PeriodKey } from "@/lib/risk-reporting";

export const dynamic = "force-dynamic";

const PERIODS = new Set<PeriodKey>(["wtd", "mtd", "std", "fytd", "inception"]);

/** People an approval can name as the assigned analyst [IPS IV.c step 6]. */
async function getAnalysts(): Promise<{ id: string; name: string }[]> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("user_profiles")
      .select("id, full_name, email, role")
      .eq("status", "approved")
      .order("full_name");
    return (data ?? [])
      .filter((p) => p.role !== "faculty")
      .map((p) => ({ id: p.id as string, name: (p.full_name as string | null) || (p.email as string) }));
  } catch {
    return [];
  }
}

/**
 * §6 Access: "Analysts: read access to their own positions only." Strips the
 * board down to the rows this analyst is the assigned analyst on, and empties
 * the portfolio-level monitors, which are not their positions.
 */
function scopeToAnalyst(model: RiskModel, userId: string): RiskModel {
  const mine = model.positions.filter((row) => row.position.approval?.analyst_id === userId);
  const symbols = new Set(mine.map((row) => row.position.symbol));
  return {
    ...model,
    positions: mine,
    monitors: [],
    sectors: [],
    exposure: null,
    fundVar: null,
    breaches: model.breaches.filter((b) => b.subject != null && symbols.has(b.subject)),
  };
}

export default async function RiskPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; period?: string }>;
}) {
  const sp = await searchParams;
  const profile = await enforceNavAccess("/risk");

  const fullBoard = canReadFullRiskBoard(profile.role);
  // §6 Access: an analyst reads their own positions only, so the Fund
  // Reporting tab is not theirs to open even by URL.
  const tab: RiskTab = sp.tab === "reporting" && fullBoard ? "reporting" : "alerts";
  const period: PeriodKey = PERIODS.has(sp.period as PeriodKey) ? (sp.period as PeriodKey) : "mtd";

  const [fullModel, fullAlertLog, navSeries, tbill, analysts] = await Promise.all([
    getRiskModel(),
    getAlertLog(200),
    getNavSeries(),
    fetchTreasuryRate(),
    getAnalysts(),
  ]);

  // Scoping happens here rather than in the component: an analyst's browser
  // should never receive the positions they are not assigned to.
  const model = fullBoard ? fullModel : scopeToAnalyst(fullModel, profile.id);
  const alertLog = fullBoard
    ? fullAlertLog
    : fullAlertLog.filter((row) =>
        row.subject ? model.positions.some((p) => p.position.symbol === row.subject) : false,
      );

  // Built from the whole book, and only for the roles that can open Tab 2.
  // An analyst never gets one, so the fund-wide figures never reach their
  // browser as a serialized prop for a tab they cannot see.
  const report = fullBoard
    ? await buildReportingModel({
        period,
        model: fullModel,
        navSeries,
        alertLog: fullAlertLog,
        config: fullModel.config,
        riskFreePct: tbill?.month3 ?? null,
      })
    : null;

  return (
    <RiskDashboard
      model={model}
      alertLog={alertLog}
      fullBoard={fullBoard}
      report={report}
      tab={tab}
      period={period}
      packs={REPORT_PACKS}
      analysts={analysts}
      sectors={model.config.coverageSectors}
      canEdit={isRiskManager(profile.role)}
    />
  );
}
