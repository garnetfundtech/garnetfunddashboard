import { NextRequest, NextResponse } from "next/server";
import { fetchEarningsCalendar } from "@/lib/fmp";
import { requireSessionUser } from "@/lib/require-session";

export async function GET(request: NextRequest) {
  const session = await requireSessionUser();
  if (session.response) return session.response;

  const from = request.nextUrl.searchParams.get("from") ?? new Date().toISOString().slice(0, 10);
  const to =
    request.nextUrl.searchParams.get("to") ??
    new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);

  try {
    const rows = await fetchEarningsCalendar(from, to);
    return NextResponse.json({ ok: true, earnings: rows });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "FMP error" },
      { status: 500 },
    );
  }
}
