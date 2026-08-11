import { WatchlistTableClient } from "@/components/dashboard/watchlist-table-client";
import { enforceNavAccess } from "@/lib/dashboard-guard";
import { getPitches, getWatchlistRows } from "@/lib/data";
import { requireProfile } from "@/lib/auth";
import { getQuotes } from "@/lib/schwab";
import { getValidTraderToken } from "@/lib/market-data";
import { fetchSectorsByTicker } from "@/lib/fmp";
import type { SchwabQuoteResponse } from "@/lib/schwab";

export default async function WatchlistPage() {
  await enforceNavAccess("/watchlist");
  const profile = await requireProfile();
  const [rows, pitches, token] = await Promise.all([
    getWatchlistRows(),
    getPitches(),
    getValidTraderToken(),
  ]);

  const syms = rows.map((r) => r.ticker);

  // Quotes and sectors both depend only on `rows`, so fetch them together.
  // Either can come back empty (no Schwab token, no FMP key) without blocking
  // the table — the client renders "—" and omits the sector dot.
  const [quotes, sectorByTicker] = await Promise.all([
    token && rows.length
      ? getQuotes(token, syms).catch(
          () => ({}) as Record<string, SchwabQuoteResponse>,
        )
      : Promise.resolve({} as Record<string, SchwabQuoteResponse>),
    fetchSectorsByTicker(syms).catch(() => ({}) as Record<string, string>),
  ]);

  const pitchOptions = pitches.map((p) => ({ id: p.id, ticker: p.ticker, thesis: p.thesis }));

  return (
    <WatchlistTableClient
      rows={rows}
      quotes={quotes}
      sectorByTicker={sectorByTicker}
      actor={{ id: profile.id, role: profile.role }}
      pitchOptions={pitchOptions}
    />
  );
}
