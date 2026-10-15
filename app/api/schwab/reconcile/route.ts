import { NextResponse, type NextRequest } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { requireSessionUser } from "@/lib/require-session";
import { canAdministerContent } from "@/lib/roles";
import { loadValidTraderToken } from "@/lib/market-data";
import {
  getAccountPositions,
  getAccountTransactions,
  getFollowedAccountHash,
  getQuotes,
  pickAccount,
  type SchwabTransaction,
} from "@/lib/schwab";
import { fetchDailyCloses } from "@/lib/fmp";

export const dynamic = "force-dynamic";

/** A holding whose Schwab value implies a price this far from a quote is flagged. */
const PRICE_GAP_PCT = 2;

/** Transaction types that move money into or out of the account. */
const CASH_FLOW_TYPES = new Set([
  "ACH_RECEIPT",
  "ACH_DISBURSEMENT",
  "CASH_RECEIPT",
  "CASH_DISBURSEMENT",
  "ELECTRONIC_FUND",
  "WIRE_IN",
  "WIRE_OUT",
  "JOURNAL",
]);

/**
 * Checks the Schwab position report against two things that do not come from
 * it: a share count rebuilt from the account's own transaction history, and
 * prices from a live quote and from FMP. Each holding says which of shares or
 * price disagrees, rather than only that something does.
 *
 * Read-only and admin-only. `?days=` widens the transaction window (a holding
 * bought before the window starts cannot be rebuilt, and says so); `?symbol=`
 * adds that symbol's raw transaction lines to the response.
 */
export async function GET(request: NextRequest) {
  const session = await requireSessionUser();
  if (session.response) return session.response;
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== "approved" || !canAdministerContent(profile.role)) {
    return NextResponse.json({ ok: false, message: "Admins only." }, { status: 403 });
  }

  const token = await loadValidTraderToken();
  if (!token) return NextResponse.json({ ok: false, message: "No valid Schwab token." }, { status: 401 });

  const days = Math.min(Math.max(Number(request.nextUrl.searchParams.get("days")) || 365, 1), 1825);
  const detailSymbol = request.nextUrl.searchParams.get("symbol")?.trim().toUpperCase() || null;

  try {
    const [raw, hash] = await Promise.all([getAccountPositions(token), getFollowedAccountHash(token)]);
    const account = pickAccount(raw);
    if (!account?.securitiesAccount || !hash) {
      return NextResponse.json({ ok: false, message: "Could not find the followed account." }, { status: 404 });
    }
    const sec = account.securitiesAccount;
    const transactions = await getAccountTransactions(token, hash, days);

    // Share count per symbol from the transaction history. Cash and fee lines
    // carry no shares; everything else is a signed quantity.
    const ledger = new Map<string, number>();
    const linesBySymbol = new Map<string, SchwabTransaction[]>();
    for (const t of transactions) {
      for (const item of t.transferItems ?? []) {
        const symbol = item.instrument?.symbol;
        const assetType = String(item.instrument?.assetType ?? "").toUpperCase();
        if (!symbol || item.feeType || assetType === "CURRENCY") continue;
        ledger.set(symbol, (ledger.get(symbol) ?? 0) + Number(item.amount ?? 0));
        const lines = linesBySymbol.get(symbol) ?? [];
        if (!lines.includes(t)) lines.push(t);
        linesBySymbol.set(symbol, lines);
      }
    }

    const positions = ((sec.positions ?? []) as Record<string, unknown>[])
      .map((p) => {
        const inst = (p.instrument ?? {}) as Record<string, unknown>;
        const shortQty = Number(p.shortQuantity ?? 0);
        const qty = shortQty > 0 ? -shortQty : Number(p.longQuantity ?? 0);
        return {
          symbol: String(inst.symbol ?? ""),
          assetType: String(inst.assetType ?? ""),
          qty,
          marketValue: Number(p.marketValue ?? 0),
        };
      })
      .filter((p) => p.symbol);

    const symbols = positions.map((p) => p.symbol);
    const quotes = symbols.length ? await getQuotes(token, symbols).catch(() => ({})) : {};
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

    const holdings = await Promise.all(
      positions.map(async (p) => {
        const ledgerQty = ledger.get(p.symbol) ?? 0;
        const impliedPrice = p.qty !== 0 ? Math.abs(p.marketValue / p.qty) : null;
        const quote = (quotes as Record<string, { quote?: { lastPrice?: number; closePrice?: number } }>)[p.symbol]
          ?.quote;
        const fmp = p.assetType === "EQUITY" || p.assetType === "COLLECTIVE_INVESTMENT"
          ? (await fetchDailyCloses(p.symbol, weekAgo, today)).closes.at(-1) ?? null
          : null;

        // Options and bonds are quoted per contract / per 100 par, so the
        // implied-price comparison only means something for shares.
        const comparable = p.assetType === "EQUITY" || p.assetType === "COLLECTIVE_INVESTMENT";
        const reference = quote?.lastPrice ?? fmp?.close ?? null;
        const priceGapPct =
          comparable && impliedPrice != null && reference ? ((impliedPrice - reference) / reference) * 100 : null;

        const flags: string[] = [];
        if (Math.abs(ledgerQty - p.qty) > 1e-6) {
          flags.push(
            ledgerQty === 0
              ? `No transactions for this holding in the last ${days} days; widen ?days= to rebuild its share count.`
              : `Schwab reports ${p.qty} but transactions add up to ${ledgerQty}.`,
          );
        }
        if (priceGapPct != null && Math.abs(priceGapPct) > PRICE_GAP_PCT) {
          flags.push(`Schwab's value implies $${impliedPrice!.toFixed(2)}, ${priceGapPct.toFixed(1)}% off the quote.`);
        }

        return {
          symbol: p.symbol,
          assetType: p.assetType,
          schwabQty: p.qty,
          transactionsQty: ledgerQty,
          schwabMarketValue: p.marketValue,
          schwabImpliedPrice: impliedPrice,
          quoteLast: quote?.lastPrice ?? null,
          quoteClose: quote?.closePrice ?? null,
          fmpClose: fmp,
          priceGapPct,
          ok: flags.length === 0,
          flags,
        };
      }),
    );

    // Symbols the history says are held but Schwab does not list.
    const missing = [...ledger.entries()]
      .filter(([symbol, qty]) => Math.abs(qty) > 1e-6 && !symbols.includes(symbol))
      .map(([symbol, qty]) => ({ symbol, transactionsQty: qty }));

    const cashFlows = transactions
      .filter((t) => CASH_FLOW_TYPES.has(String(t.type)))
      .map((t) => ({
        date: (t.tradeDate ?? t.time ?? "").slice(0, 10),
        type: t.type,
        description: t.description ?? null,
        netAmount: t.netAmount ?? null,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const countsByType: Record<string, number> = {};
    for (const t of transactions) countsByType[String(t.type)] = (countsByType[String(t.type)] ?? 0) + 1;

    return NextResponse.json({
      ok: true,
      account: `…${String(sec.accountNumber ?? "").slice(-4)}`,
      windowDays: days,
      transactionCount: transactions.length,
      countsByType,
      holdings,
      heldPerTransactionsButNotListed: missing,
      cashFlows,
      ...(detailSymbol ? { transactions: { [detailSymbol]: linesBySymbol.get(detailSymbol) ?? [] } } : {}),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "Reconciliation failed." },
      { status: 500 },
    );
  }
}
