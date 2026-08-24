import { NextRequest, NextResponse } from "next/server";
import { getCachedPortfolioPerformance as getPortfolioPerformance, type PerformancePeriod } from "@/lib/portfolio-performance";

const VALID_PERIODS: PerformancePeriod[] = ["1D", "1W", "2W", "1M", "3M", "6M", "1Y", "YTD"];

export async function GET(request: NextRequest) {
  const periodParam = (request.nextUrl.searchParams.get("period") ?? "YTD") as PerformancePeriod;
  const period: PerformancePeriod = VALID_PERIODS.includes(periodParam) ? periodParam : "YTD";

  const result = await getPortfolioPerformance(period);
  return NextResponse.json(result);
}
