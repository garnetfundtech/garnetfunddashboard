import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRiskModel } from "@/lib/risk-live";
import { requireSessionUser } from "@/lib/require-session";
import { buildRiskReport, type ReportPeriod, type SnapshotRow } from "@/lib/risk-report";

export const dynamic = "force-dynamic";

const PERIODS: ReportPeriod[] = ["daily", "weekly", "monthly"];
const HISTORY_LIMIT: Record<ReportPeriod, number> = { daily: 2, weekly: 7, monthly: 31 };

/**
 * Generates the daily / weekly / monthly report as structured JSON + markdown.
 * GET /api/risk/report?period=monthly[&format=markdown]
 *
 * Contains fund data, so it requires a logged-in session — or a cron bearer
 * token when CRON_SECRET is configured (for automated delivery).
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const cronOk = Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
  if (!cronOk) {
    const { user, response } = await requireSessionUser();
    if (!user) return response;
  }

  const param = request.nextUrl.searchParams.get("period");
  const period: ReportPeriod = PERIODS.includes(param as ReportPeriod) ? (param as ReportPeriod) : "daily";
  const format = request.nextUrl.searchParams.get("format");

  const model = await getRiskModel();

  let history: SnapshotRow[] = [];
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("risk_snapshots")
      .select("captured_on, nav, drawdown_from_high, sharpe")
      .order("captured_on", { ascending: false })
      .limit(HISTORY_LIMIT[period]);
    history = (data ?? []) as SnapshotRow[];
  } catch {
    history = [];
  }

  const report = buildRiskReport(model, period, history);

  if (format === "markdown") {
    return new NextResponse(report.markdown, {
      headers: { "Content-Type": "text/markdown; charset=utf-8" },
    });
  }
  return NextResponse.json(report);
}
