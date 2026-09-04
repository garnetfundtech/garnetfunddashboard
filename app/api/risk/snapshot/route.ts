import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRiskModel, snapshotPositions } from "@/lib/risk-live";
import { findMonitor } from "@/lib/risk-engine";
import { evaluateEpisodes, recordStopLossEvents } from "@/lib/risk-episodes";
import { recordNav } from "@/lib/risk-nav";
import { fetchTreasuryRate } from "@/lib/fmp";

export const dynamic = "force-dynamic";

/**
 * The daily close-of-day run (see vercel.json). It does four things in order,
 * each of which must survive the next one failing:
 *
 *   1. Records the day's NAV. §8: the Fund's own NAV series "cannot be
 *      reconstructed after the fact", so this is the one write that must never
 *      be skipped — volatility, Sharpe and every period return depend on it.
 *   2. Stores the immutable daily snapshot, including the full evaluated model
 *      so any report rebuilds verbatim for an audit [§6 Storage].
 *   3. Records any stop that fired, opening its post-mortem requirement.
 *   4. Runs the close-of-day episode batch, which sends at most one email per
 *      tier no matter how many limits went red.
 *
 * Guarded by CRON_SECRET when set. Never snapshots anything but live data.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }
  }

  const model = await getRiskModel();
  if (!model.hasLiveData || model.nav == null) {
    return NextResponse.json({ ok: false, message: "No live data to snapshot." }, { status: 409 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const value = (id: string) => findMonitor(model, id)?.value ?? null;

  // 1. NAV first, and on its own error boundary: a snapshot without a NAV row
  // is recoverable, a missing NAV day is not.
  let navRecorded = false;
  try {
    await recordNav({ capturedOn: today, nav: model.nav, source: "broker" });
    navRecorded = true;
  } catch {
    /* reported in the response below */
  }

  const tbill = await fetchTreasuryRate().catch(() => null);

  try {
    const admin = createAdminClient();
    const { error } = await admin.from("risk_snapshots").upsert(
      {
        captured_on: today,
        nav: model.nav,
        net_pct: model.exposure?.netPct ?? null,
        gross_pct: model.exposure?.grossPct ?? null,
        equities_pct: model.exposure?.equitiesPct ?? null,
        alternatives_pct: model.exposure?.alternativesPct ?? null,
        annualized_vol: value("annualized-volatility"),
        var_95_dollars: model.fundVar?.dollars ?? null,
        var_95_pct: model.fundVar?.pct ?? null,
        margin_debit: value("margin-debit"),
        cash_pct: value("cash-available"),
        max_sector_pct: value("sector-concentration"),
        sector_exposure: model.sectors,
        net_theta: value("alternatives-theta"),
        net_vega: value("alternatives-vega"),
        benchmark_yield: tbill?.month3 ?? null,
        red_count: model.counts.red,
        yellow_count: model.counts.yellow,
        green_count: model.counts.green,
        positions: snapshotPositions(model),
        position_count: model.positions.length,
        long_mv: model.exposure?.longExposure ?? null,
        short_mv: model.exposure?.shortExposure ?? null,
        model,
      },
      { onConflict: "captured_on" },
    );
    if (error) throw error;

    // 3 and 4 must not undo the snapshot that already succeeded.
    const stops = await recordStopLossEvents(model).catch(() => 0);
    const episodes = await evaluateEpisodes(model, { closeOfDay: true }).catch(() => null);

    return NextResponse.json({
      ok: true,
      captured_on: today,
      navRecorded,
      positions: model.positions.length,
      stopLossEvents: stops,
      opened: episodes?.opened ?? 0,
      closed: episodes?.closed ?? 0,
      escalated: episodes?.escalated ?? 0,
      notified: episodes?.notified ?? 0,
      unresolvedRecipients: episodes?.unresolvedRecipients ?? [],
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, navRecorded, message: err instanceof Error ? err.message : "Snapshot failed." },
      { status: 500 },
    );
  }
}

// Vercel cron issues GET; support both.
export async function GET(request: NextRequest) {
  return POST(request);
}
