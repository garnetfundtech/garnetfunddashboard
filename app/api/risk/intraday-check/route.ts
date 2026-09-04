import { NextResponse, type NextRequest } from "next/server";
import { getRiskModel } from "@/lib/risk-live";
import { evaluateEpisodes, recordStopLossEvents } from "@/lib/risk-episodes";

export const dynamic = "force-dynamic";

/**
 * The intraday sweep. §4.4 names five reds that notify "immediately on
 * detection" rather than waiting for the close batch: a stop-loss execution, a
 * missing or mispriced stop order, a long over its cap, a short over its cap,
 * and a trading-calendar breach — plus the margin debit, which escalates to
 * Operations because it is a tax-status issue.
 *
 * Those are exactly the monitors tagged `timing: "intraday"`, so this filters
 * on that tag rather than on a hand-maintained list that could drift away from
 * the routing table. Everything else waits for /api/risk/snapshot, and the
 * two runs cannot double-notify because both go through the same episode
 * state: an episode already open sends nothing.
 *
 * §6 also notes that intraday refresh, where the broker offers it, is
 * desirable "for the stop-loss and 10% cap checks only" — which is this.
 *
 * Cadence, honestly: on Vercel's Hobby plan a cron may run at most once a day,
 * and fires anywhere inside the hour it is scheduled for. So this is one sweep
 * near midday rather than the continuous watch §4.4's "immediately on
 * detection" describes. A stop that fills after this run is caught by the
 * close-of-day snapshot instead — same episode, same single email, just later.
 * Closing that gap means a Pro plan, where the schedule can drop to minutes;
 * nothing in this route needs to change for that, only vercel.json.
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
  if (!model.hasLiveData) {
    return NextResponse.json({ ok: false, message: "No live data." }, { status: 409 });
  }

  const stops = await recordStopLossEvents(model).catch(() => 0);
  const result = await evaluateEpisodes(model, { onlyTiming: "intraday" });

  return NextResponse.json({ ok: true, stopLossEvents: stops, ...result });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
