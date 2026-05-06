import { NextRequest, NextResponse } from "next/server";
import { getValidTraderToken, fetchBenchmarkHistory, type PeriodKey } from "@/lib/market-data";

const VALID_PERIODS: PeriodKey[] = ["1M", "3M", "6M", "1Y", "YTD"];

export async function GET(request: NextRequest) {
  const periodParam = request.nextUrl.searchParams.get("period") ?? "YTD";
  const period = VALID_PERIODS.includes(periodParam as PeriodKey)
    ? (periodParam as PeriodKey)
    : "YTD";

  const token = await getValidTraderToken();
  if (!token) {
    return NextResponse.json({ ok: false, message: "No valid Schwab token." }, { status: 401 });
  }

  try {
    const history = await fetchBenchmarkHistory(period);
    if (!history) {
      return NextResponse.json({ ok: false, message: "Could not fetch price history." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, ...history });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "Price history failed" },
      { status: 500 },
    );
  }
}
