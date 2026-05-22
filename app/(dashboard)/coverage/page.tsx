import { requireProfile } from "@/lib/auth";
import { getResearchItemsForUser } from "@/lib/data";
import { getValidTraderToken } from "@/lib/market-data";
import { getQuotes } from "@/lib/schwab";
import { fetchPortfolioSummary } from "@/lib/market-data";
import { CoveragePageClient } from "@/components/dashboard/coverage-page-client";

export default async function CoveragePage() {
  const profile = await requireProfile();
  const coverageSector = profile.coverage_sector ?? null;

  const [myResearch, portfolio, token] = await Promise.all([
    getResearchItemsForUser(profile.id),
    fetchPortfolioSummary(),
    getValidTraderToken(),
  ]);

  // Find holdings in the analyst's sector
  const sectorPositions = coverageSector
    ? (portfolio?.positions ?? []).filter(
        (p) => (p.sector ?? "").toLowerCase() === coverageSector.toLowerCase(),
      )
    : [];

  // Fetch live quotes for sector positions
  let sectorQuotes: Record<string, { price: number; changePct: number }> = {};
  if (token && sectorPositions.length) {
    try {
      const tickers = sectorPositions.map((p) => p.ticker);
      const raw = await getQuotes(token, tickers);
      for (const [ticker, data] of Object.entries(raw)) {
        sectorQuotes[ticker] = {
          price: data.quote?.lastPrice ?? 0,
          changePct: data.quote?.netPercentChange ?? 0,
        };
      }
    } catch {
      sectorQuotes = {};
    }
  }

  return (
    <CoveragePageClient
      analystName={profile.full_name ?? (`${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || "You")}
      coverageSector={coverageSector}
      myResearch={myResearch}
      sectorPositions={sectorPositions}
      sectorQuotes={sectorQuotes}
    />
  );
}
