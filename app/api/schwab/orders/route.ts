import { NextRequest, NextResponse } from "next/server";
import { getOrderHistory } from "@/lib/order-history";
import { requireSessionUser } from "@/lib/require-session";

/**
 * Reads from order_history (Supabase) rather than pulling live from Schwab on
 * every request — historical fills don't change, so once synced they're a
 * plain table read. Populate/refresh that table via POST /api/schwab/orders/sync.
 */
export async function GET(request: NextRequest) {
  const session = await requireSessionUser();
  if (session.response) return session.response;

  const days = Math.min(365, Math.max(1, Number(request.nextUrl.searchParams.get("days") ?? 60)));
  try {
    const orders = await getOrderHistory(days);
    return NextResponse.json(
      { ok: true, orders },
      { headers: { "Cache-Control": "private, max-age=30" } },
    );
  } catch (err) {
    // Otherwise a Supabase error surfaces as an HTML 500 the client reports as
    // a generic network failure, with the real cause nowhere in sight.
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "Failed to read order history." },
      { status: 500 },
    );
  }
}
