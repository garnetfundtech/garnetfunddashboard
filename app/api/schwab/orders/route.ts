import { NextRequest, NextResponse } from "next/server";
import { fetchAccountOrders } from "@/lib/market-data";
import { normalizeSchwabOrders } from "@/lib/schwab-orders";
import { requireSessionUser } from "@/lib/require-session";

export async function GET(request: NextRequest) {
  const session = await requireSessionUser();
  if (session.response) return session.response;

  const days = Math.min(365, Math.max(1, Number(request.nextUrl.searchParams.get("days") ?? 60)));
  const raw = await fetchAccountOrders(days);
  if (raw === null) {
    return NextResponse.json({ ok: false, message: "Schwab orders unavailable." }, { status: 503 });
  }
  const orders = normalizeSchwabOrders(raw);
  return NextResponse.json(
    { ok: true, orders },
    { headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" } },
  );
}
