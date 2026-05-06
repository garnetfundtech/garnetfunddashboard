import { NextRequest, NextResponse } from "next/server";
import { fetchRecentForm4ForTicker } from "@/lib/edgar";
import { requireSessionUser } from "@/lib/require-session";

export async function GET(request: NextRequest) {
  const session = await requireSessionUser();
  if (session.response) return session.response;

  const ticker = (request.nextUrl.searchParams.get("ticker") ?? "").trim().toUpperCase();
  if (!ticker) {
    return NextResponse.json({ ok: false, message: "ticker required" }, { status: 400 });
  }

  try {
    const filings = await fetchRecentForm4ForTicker(ticker, 10);
    return NextResponse.json({ ok: true, ticker, filings });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "EDGAR error" },
      { status: 500 },
    );
  }
}
