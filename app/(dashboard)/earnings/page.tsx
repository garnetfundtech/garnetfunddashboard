import { EarningsTableClient } from "@/components/dashboard/earnings-table-client";
import { enforceNavAccess } from "@/lib/dashboard-guard";
import { getWatchlistTickers } from "@/lib/data";
import { fetchEarningsCalendar, fetchProfile } from "@/lib/fmp";
import { fetchPortfolioSummary } from "@/lib/market-data";

export default async function EarningsPage() {
  await enforceNavAccess("/earnings");

  const fromDate = new Date();
  const from = fromDate.toISOString().slice(0, 10);
  const toDate = new Date(fromDate);
  toDate.setUTCDate(toDate.getUTCDate() + 21);
  const to = toDate.toISOString().slice(0, 10);

  let rows: Awaited<ReturnType<typeof fetchEarningsCalendar>> = [];
  try {
    rows = await fetchEarningsCalendar(from, to);
  } catch {
    rows = [];
  }

  const symbols = [...new Set(rows.map((r) => r.symbol.trim().toUpperCase()).filter(Boolean))];
  const profilePairs = await Promise.all(
    symbols.map(async (symbol) => {
      const profile = await fetchProfile(symbol);
      return [symbol, profile?.companyName?.trim() || null] as const;
    }),
  );
  const companyBySymbol = new Map(profilePairs);
  rows = rows.map((row) => {
    const symbol = row.symbol.trim().toUpperCase();
    const companyName = companyBySymbol.get(symbol);
    return {
      ...row,
      symbol,
      name: companyName || row.name || row.symbol,
    };
  });

  const [portfolio, watchTickers] = await Promise.all([fetchPortfolioSummary(), getWatchlistTickers()]);
  const heldSet = new Set((portfolio?.positions ?? []).map((p) => p.ticker.toUpperCase()));
  const watchSet = new Set(watchTickers.map((t) => t.toUpperCase()));

  return <EarningsTableClient rows={rows} heldSet={heldSet} watchSet={watchSet} />;
}
