import { requireApprovedProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { dailyReturns, type NavPoint } from "@/lib/risk-nav";
import { csvResponse } from "@/lib/csv";

export const dynamic = "force-dynamic";

/**
 * A day whose return is larger than this is more likely money moving or a bad
 * broker mark than performance. At the IPS's 12% annualized volatility ceiling
 * a 5% day is over six standard deviations, so it is flagged for a person to
 * check rather than dropped.
 */
const SUSPICIOUS_DAILY_MOVE = 0.05;

/**
 * The fund's daily total return series, one row per stored NAV day, oldest
 * first. Same §6 formula as every figure on the risk board: (NAV today − NAV
 * yesterday − net external flows) ÷ NAV yesterday, via `dailyReturns`.
 *
 * Nothing is filtered out beyond the non-positive NAVs `getNavSeries` also
 * drops. Days the reader may not want to trust are labelled in the Flag
 * column instead, so the decision about where the reliable series starts
 * stays with them and is visible in the file.
 */
export async function GET() {
  await requireApprovedProfile();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("nav_daily")
    .select("captured_on, nav, external_flow, source, note")
    .order("captured_on", { ascending: true });
  if (error) {
    return new Response(`Could not read the NAV series: ${error.message}`, { status: 500 });
  }

  const points = ((data ?? []) as (NavPoint & { note: string | null })[]).filter((p) => Number(p.nav) > 0);
  const returns = dailyReturns(points);

  const header = [
    "Date",
    "NAV",
    "External flow",
    "Daily total return (%)",
    "Cumulative return (%)",
    "Source",
    "Flag",
    "Note",
  ];

  let growth = 1;
  const body = points.map((p, i) => {
    // The first stored day has no prior NAV, so it is the base, not a return.
    const r = i > 0 ? returns[i - 1] : null;
    if (r != null) growth *= 1 + r;

    const flags: string[] = [];
    if (i === 0) flags.push("Base day, no return");
    if (p.note?.startsWith("Move of")) flags.push("Flow estimated by backfill, return forced to 0");
    if (r != null && Math.abs(r) > SUSPICIOUS_DAILY_MOVE) {
      flags.push("Move over 5%: check for an unrecorded flow or a bad broker mark");
    }
    const day = new Date(`${p.captured_on}T12:00:00Z`).getUTCDay();
    if (day === 0 || day === 6) flags.push("Weekend");

    return [
      p.captured_on,
      Number(p.nav),
      Number(p.external_flow ?? 0),
      r == null ? "" : Number((r * 100).toFixed(6)),
      i === 0 ? "" : Number(((growth - 1) * 100).toFixed(6)),
      p.source,
      flags.join("; "),
      p.note ?? "",
    ];
  });

  return csvResponse(header, body, "garnet-fund-daily-returns");
}
