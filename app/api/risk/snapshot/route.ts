import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRiskModel, getSnapshotBook } from "@/lib/risk-live";
import { findRow } from "@/lib/risk-engine";
import { evaluateEpisodes } from "@/lib/risk-episodes";

export const dynamic = "force-dynamic";

/**
 * Writes today's risk snapshot. Intended for the daily Vercel cron (see
 * vercel.json). Guarded by CRON_SECRET when set. Never snapshots the sample
 * book — only live data is persisted.
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

  // The position list is fetched alongside the model rather than read out of
  // it: the model only carries aggregates, and drift-vs-trade breach
  // classification needs each day's share counts. A failure here must not lose
  // the aggregate snapshot, so it degrades to null rather than throwing.
  const book = await getSnapshotBook().catch(() => null);

  const num = (id: string) => findRow(model, id)?.value ?? null;
  const today = new Date().toISOString().slice(0, 10);

  try {
    const admin = createAdminClient();
    const { error } = await admin.from("risk_snapshots").upsert(
      {
        captured_on: today,
        nav: model.nav,
        net_pct: model.exposure?.netPct ?? null,
        gross_pct: model.exposure?.grossPct ?? null,
        net_beta: num("net-beta"),
        var_95: model.varView?.var95 ?? null,
        cvar_95: model.varView?.cvar95 ?? null,
        realized_vol: num("realized-vol"),
        sharpe: num("sharpe"),
        drawdown_from_high: num("drawdown-from-high"),
        worst_stress: model.worstStress?.pnlPct ?? null,
        red_count: model.counts.red,
        yellow_count: model.counts.yellow,
        green_count: model.counts.green,
        positions: book?.positions ?? null,
        position_count: book?.positions.length ?? null,
        long_mv: book?.longMV ?? null,
        short_mv: book?.shortMV ?? null,
        model,
      },
      { onConflict: "captured_on" },
    );
    if (error) throw error;

    // Close-of-day episode batch: fires the once-per-episode notifications
    // and writes any new reds to the breach log. A failure here must not
    // undo the snapshot that already succeeded above.
    const episodeResult = await evaluateEpisodes(model).catch(() => null);

    return NextResponse.json({
      ok: true,
      captured_on: today,
      positions: book?.positions.length ?? 0,
      notified: episodeResult?.notified ?? 0,
      breachesLogged: episodeResult?.logged ?? 0,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "Snapshot failed." },
      { status: 500 },
    );
  }
}

// Vercel cron issues GET; support both.
export async function GET(request: NextRequest) {
  return POST(request);
}
