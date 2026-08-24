import { NextResponse } from "next/server";
import { fetchPortfolioSummary } from "@/lib/market-data";
import { requireSessionUser } from "@/lib/require-session";

/**
 * The one Schwab connection indicator shown on every page. `verifiedAt` comes
 * straight off fetchPortfolioSummary's own cached result, which now falls
 * back to the last known-good snapshot on failure — so `verifiedAt` reflects
 * when data was actually last confirmed live, not the moment of this request.
 */
export async function GET() {
  const session = await requireSessionUser();
  if (session.response) return session.response;

  const portfolio = await fetchPortfolioSummary();
  return NextResponse.json({
    connected: portfolio != null,
    syncedAt: portfolio?.verifiedAt ?? null,
  });
}
