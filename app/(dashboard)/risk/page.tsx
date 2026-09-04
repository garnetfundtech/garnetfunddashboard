import { RiskDashboard, type RiskTab } from "@/components/dashboard/risk-dashboard";
import { enforceNavAccess } from "@/lib/dashboard-guard";
import { isRiskManager } from "@/lib/nav-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchTreasuryRate } from "@/lib/fmp";
import { getRiskModel } from "@/lib/risk-live";
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

export default async function RiskPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; period?: string }>;
}) {
  const sp = await searchParams;
  const profile = await enforceNavAccess("/risk");

  const tab: RiskTab = sp.tab === "reporting" ? "reporting" : "alerts";
  const period: PeriodKey = PERIODS.has(sp.period as PeriodKey) ? (sp.period as PeriodKey) : "mtd";

  const [model, alertLog, navSeries, tbill, analysts] = await Promise.all([
    getRiskModel(),
    getAlertLog(200),
    getNavSeries(),
    fetchTreasuryRate(),
    getAnalysts(),
  ]);

  const report = await buildReportingModel({
    period,
    model,
    navSeries,
    alertLog,
    config: model.config,
    riskFreePct: tbill?.month3 ?? null,
  });

  return (
    <RiskDashboard
      model={model}
      alertLog={alertLog}
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
