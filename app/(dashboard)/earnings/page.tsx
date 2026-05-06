import { EarningsTableClient } from "@/components/dashboard/earnings-table-client";
import { enforceNavAccess } from "@/lib/dashboard-guard";
import { getWatchlistTickers } from "@/lib/data";
import { fetchEarningsCalendar } from "@/lib/fmp";
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

  const [portfolio, watchTickers] = await Promise.all([fetchPortfolioSummary(), getWatchlistTickers()]);
  const heldSet = new Set((portfolio?.positions ?? []).map((p) => p.ticker.toUpperCase()));
  const watchSet = new Set(watchTickers.map((t) => t.toUpperCase()));

  return (
    <div className="space-y-3 pt-2">
      <h1 className="page-title">Earnings calendar</h1>
      <p className="text-xs text-zinc-500">
        Upcoming reports ({from} → {to}). Optional S&amp;P 500 coverage can be added later via FMP screeners.
      </p>
      <EarningsTableClient rows={rows} heldSet={heldSet} watchSet={watchSet} />
    </div>
  );
}
