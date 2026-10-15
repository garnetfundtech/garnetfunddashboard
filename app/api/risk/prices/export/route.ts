import { requireApprovedProfile } from "@/lib/auth";
import { canReadFullRiskBoard } from "@/lib/nav-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadValidTraderToken } from "@/lib/market-data";
import { getPriceHistory } from "@/lib/schwab";
import { csvResponse } from "@/lib/csv";

export const dynamic = "force-dynamic";

type ExcludedHolding = { symbol: string; reason: string };

/** A candle's trade date in New York, where the market's day is defined. */
function tradeDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

/**
 * Daily closing prices from Schwab's price history for every holding in the
 * stored snapshots, one row per date and one column per ticker, oldest first.
 *
 * The holdings are the same set the Holdings download lists, read from
 * risk_snapshots rather than a fixed list. A holding Schwab returns no daily
 * prices for (a bond CUSIP, an option contract) is left out of the file and
 * named, with the reason, in the X-Excluded-Holdings header, which the Fund
 * Reporting tab shows beside the button. A date a ticker has no price for is
 * left blank, never filled.
 *
 * These are Schwab's closes as returned; nothing here adjusts them for
 * distributions or anything else.
 */
export async function GET() {
  const profile = await requireApprovedProfile();
  if (!canReadFullRiskBoard(profile.role)) {
    return new Response("Not available to your role.", { status: 403 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.from("risk_snapshots").select("positions");
  if (error) {
    return new Response(`Could not read the holdings history: ${error.message}`, { status: 500 });
  }

  // Every holding ever stored, with the asset class the snapshot gave it.
  const holdings = new Map<string, string>();
  for (const snap of (data ?? []) as { positions: { symbol: string; assetClass?: string }[] | null }[]) {
    for (const p of snap.positions ?? []) {
      if (p?.symbol) holdings.set(p.symbol, p.assetClass ?? "");
    }
  }

  const token = await loadValidTraderToken();
  if (!token) {
    return new Response("No valid Schwab connection, so prices cannot be fetched. Re-link Schwab on Admin.", {
      status: 503,
    });
  }

  const excluded: ExcludedHolding[] = [];
  const prices = new Map<string, Map<string, number>>();

  await Promise.all(
    [...holdings.entries()].map(async ([symbol, assetClass]) => {
      if (assetClass === "Cash") {
        excluded.push({ symbol, reason: "Cash has no market price." });
        return;
      }
      try {
        const history = await getPriceHistory(token, symbol, "year", 1, "daily", 1);
        const closes = new Map<string, number>();
        for (const c of history.candles ?? []) {
          if (Number.isFinite(c.close) && c.close > 0) closes.set(tradeDate(c.datetime), c.close);
        }
        if (closes.size === 0) {
          excluded.push({ symbol, reason: `Schwab returned no daily prices (${assetClass || "unknown type"}).` });
          return;
        }
        prices.set(symbol, closes);
      } catch (err) {
        const detail = err instanceof Error ? err.message : "request failed";
        excluded.push({ symbol, reason: `Schwab price history unavailable: ${detail} (${assetClass || "unknown type"}).` });
      }
    }),
  );

  const tickers = [...prices.keys()].sort();
  const dates = [...new Set(tickers.flatMap((t) => [...prices.get(t)!.keys()]))].sort();

  const header = ["Date", ...tickers.map((t) => `${t} close (USD)`)];
  const body = dates.map((d) => [d, ...tickers.map((t) => prices.get(t)!.get(d) ?? "")]);

  const response = csvResponse(header, body, "garnet-fund-daily-prices");
  excluded.sort((a, b) => a.symbol.localeCompare(b.symbol));
  response.headers.set("X-Excluded-Holdings", encodeURIComponent(JSON.stringify(excluded)));
  return response;
}
