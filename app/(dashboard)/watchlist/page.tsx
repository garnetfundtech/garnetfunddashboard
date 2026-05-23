import { WatchlistTableClient } from "@/components/dashboard/watchlist-table-client";
import { enforceNavAccess } from "@/lib/dashboard-guard";
import { getPitches, getWatchlistRows } from "@/lib/data";
import { requireProfile } from "@/lib/auth";
import { getQuotes } from "@/lib/schwab";
import { getValidTraderToken } from "@/lib/market-data";
import type { SchwabQuoteResponse } from "@/lib/schwab";

export default async function WatchlistPage() {
  await enforceNavAccess("/watchlist");
  const profile = await requireProfile();
  const [rows, pitches, token] = await Promise.all([
    getWatchlistRows(),
    getPitches(),
    getValidTraderToken(),
  ]);

  let quotes: Record<string, SchwabQuoteResponse> = {};
  if (token && rows.length) {
    const syms = rows.map((r) => r.ticker);
    try {
      quotes = await getQuotes(token, syms);
    } catch {
      quotes = {};
    }
  }

  const pitchOptions = pitches.map((p) => ({ id: p.id, ticker: p.ticker, thesis: p.thesis }));

  return (
    <WatchlistTableClient
      rows={rows}
      quotes={quotes}
      actor={{ id: profile.id, role: profile.role }}
      pitchOptions={pitchOptions}
    />
  );
}
