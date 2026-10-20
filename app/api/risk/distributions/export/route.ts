import { requireApprovedProfile } from "@/lib/auth";
import { canReadFullRiskBoard } from "@/lib/nav-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadValidTraderToken } from "@/lib/market-data";
import { getAccountNumbers, getAccountTransactions, getQuotes } from "@/lib/schwab";
import { csvResponse } from "@/lib/csv";

export const dynamic = "force-dynamic";

/** Schwab sends dates as ISO timestamps; the day is what matters here. */
const day = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 10) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : "");

/**
 * The distribution data Schwab can give the site. The project stores none of
 * its own, and none of this is a full distribution history:
 *
 *   "Schwab quote" rows: the most recent distribution Schwab's quote reports
 *   for each holding (ex-date, per-share amount, pay date). One per holding.
 *
 *   "Fund account" rows: dividend and interest payments the fund actually
 *   received, from the transaction history of each account the Schwab login
 *   can see, over the last year. Cash received, not per share.
 *
 * A holding Schwab reports nothing for gets a row saying so rather than being
 * dropped, so a missing distribution is visible instead of looking like none.
 */
export async function GET() {
  const profile = await requireApprovedProfile();
  if (!canReadFullRiskBoard(profile.role)) {
    return new Response("Not available to your role.", { status: 403 });
  }

  // The same holdings as the Holdings and Daily prices downloads.
  const admin = createAdminClient();
  const { data, error } = await admin.from("risk_snapshots").select("positions");
  if (error) {
    return new Response(`Could not read the holdings history: ${error.message}`, { status: 500 });
  }
  const holdings = new Map<string, string>();
  for (const snap of (data ?? []) as { positions: { symbol: string; assetClass?: string }[] | null }[]) {
    for (const p of snap.positions ?? []) {
      if (p?.symbol && p.assetClass !== "Cash") holdings.set(p.symbol, p.assetClass ?? "");
    }
  }

  const token = await loadValidTraderToken();
  if (!token) {
    return new Response("No valid Schwab connection. Re-link Schwab on Admin.", { status: 503 });
  }

  const header = [
    "Ticker",
    "Source",
    "Ex-dividend date",
    "Pay date",
    "Amount per share (USD)",
    "Cash received (USD)",
    "Account",
    "Note",
  ];
  const body: unknown[][] = [];

  // 1. The latest distribution per holding, from the quote. Only stocks and
  // funds are asked for: a bond CUSIP or option symbol is not an equity quote,
  // and one bad symbol must not fail the request for the rest.
  const symbols = [...holdings.keys()].sort();
  const quotable = symbols.filter((s) => holdings.get(s) === "Equity");
  const quotes = quotable.length ? await getQuotes(token, quotable).catch(() => null) : {};
  for (const symbol of symbols) {
    if (holdings.get(symbol) !== "Equity") {
      body.push([symbol, "Schwab quote (latest only)", "", "", "", "", "",
        `Not a stock or fund (${holdings.get(symbol) || "unknown type"}); any coupons or interest appear in the Fund account rows.`]);
      continue;
    }
    const f = (quotes?.[symbol] as { fundamental?: Record<string, unknown> } | undefined)?.fundamental;
    let note = "";
    if (!quotes) note = "Schwab quote request failed.";
    else if (!f) note = "Schwab returned no quote data for this holding.";
    else if (!("divExDate" in f) && !("divPayAmount" in f)) note = "Schwab's quote has no distribution fields.";
    else if (!day(f.divExDate)) note = "Schwab reports no distribution.";
    body.push([
      symbol,
      "Schwab quote (latest only)",
      day(f?.divExDate),
      day(f?.divPayDate),
      num(f?.divPayAmount),
      "",
      "",
      note,
    ]);
  }

  // 2. What the fund's accounts actually received.
  try {
    const accounts = await getAccountNumbers(token);
    for (const account of accounts) {
      const transactions = await getAccountTransactions(token, account.hashValue, 365);
      for (const t of transactions) {
        if (t.type !== "DIVIDEND_OR_INTEREST") continue;
        const security = (t.transferItems ?? []).find(
          (i) => i.instrument?.symbol && String(i.instrument.assetType ?? "").toUpperCase() !== "CURRENCY",
        );
        body.push([
          security?.instrument?.symbol ?? "",
          "Fund account (received)",
          "",
          day(t.tradeDate ?? t.time),
          "",
          num(t.netAmount),
          `…${account.accountNumber.slice(-4)}`,
          t.description ?? "",
        ]);
      }
    }
  } catch (err) {
    body.push(["", "Fund account (received)", "", "", "", "", "", `Transaction history unavailable: ${err instanceof Error ? err.message : "request failed"}`]);
  }

  return csvResponse(header, body, "garnet-fund-distributions");
}
