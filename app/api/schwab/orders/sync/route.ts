import { NextRequest, NextResponse } from "next/server";
import { syncOrderHistory } from "@/lib/order-history";
import { requireSessionUser } from "@/lib/require-session";

/**
 * Pulls the given window of orders from Schwab and upserts into order_history.
 * Same operation for the one-time backfill and the ongoing incremental sync —
 * only `days` differs. Call with a large `days` once to backfill, then a
 * small `days` (e.g. from a daily cron alongside the risk snapshot) to pick
 * up anything filled since the last sync.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (secret && auth === `Bearer ${secret}`) {
    // cron call — no session required
  } else {
    const session = await requireSessionUser();
    if (session.response) return session.response;
  }

  const body = await request.json().catch(() => ({}));
  const days = Math.min(3650, Math.max(1, Number(body.days ?? request.nextUrl.searchParams.get("days") ?? 7)));

  try {
    const result = await syncOrderHistory(days);
    if (!result) {
      return NextResponse.json({ ok: false, message: "No valid Schwab session." }, { status: 409 });
    }
    return NextResponse.json({ ok: true, synced: result.synced });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "Sync failed." },
      { status: 500 },
    );
  }
}

// Vercel cron issues GET; support both. Cron always wants the small
// incremental window — a full backfill is a deliberate one-off, not scheduled.
export async function GET(request: NextRequest) {
  return POST(request);
}
