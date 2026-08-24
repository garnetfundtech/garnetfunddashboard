import { NextResponse, type NextRequest } from "next/server";
import { getRiskModel } from "@/lib/risk-live";
import { evaluateEpisodes } from "@/lib/risk-episodes";

export const dynamic = "force-dynamic";

/**
 * Item 5 (large single-day move) is the one alert that has to interrupt the
 * trading day rather than wait for the close batch — "the whole point of it
 * is acting before the close." This checks only that item, on whatever
 * cadence a cron hits it during market hours (e.g. every 15–30 minutes),
 * without touching the other nine items or double-writing the close-of-day
 * episode/breach state those run through in /api/risk/snapshot.
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

  const result = await evaluateEpisodes(model, { onlyItemIds: ["single-day-move"] });
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
