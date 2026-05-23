import { EarningsTableClient } from "@/components/dashboard/earnings-table-client";
import { enforceNavAccess } from "@/lib/dashboard-guard";
import { getWatchlistTickers } from "@/lib/data";
import { fetchEarningsCalendar } from "@/lib/fmp";
import { fetchPortfolioSummary } from "@/lib/market-data";

export default async function EarningsPage() {
  await enforceNavAccess("/earnings");

  // Fetch from Monday of the current week through end of next week
  // so the local calendar always has full data regardless of server timezone
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon...
  const daysToMonday = (dayOfWeek + 6) % 7; // days back to Monday
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - daysToMonday);
  const nextFriday = new Date(monday);
  nextFriday.setUTCDate(monday.getUTCDate() + 11); // Mon + 11 = next Friday

  const from = monday.toISOString().slice(0, 10);
  const to = nextFriday.toISOString().slice(0, 10);

  let rows: Awaited<ReturnType<typeof fetchEarningsCalendar>> = [];
  try {
    rows = await fetchEarningsCalendar(from, to);
  } catch {
    rows = [];
  }

  // Normalise symbols and use FMP-provided names directly (no per-symbol profile fetch)
  rows = rows.map((row) => ({
    ...row,
    symbol: row.symbol.trim().toUpperCase(),
    name: row.name?.trim() || row.symbol.trim().toUpperCase(),
  }));

  const [portfolio, watchTickers] = await Promise.all([
    fetchPortfolioSummary(),
    getWatchlistTickers(),
  ]);
  const heldSet = new Set((portfolio?.positions ?? []).map((p) => p.ticker.toUpperCase()));
  const watchSet = new Set(watchTickers.map((t) => t.toUpperCase()));

  return <EarningsTableClient rows={rows} heldSet={heldSet} watchSet={watchSet} />;
}
