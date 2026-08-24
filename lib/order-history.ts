import { createAdminClient } from "@/lib/supabase/admin";
import { getAccountNumbers, getAccountOrders } from "@/lib/schwab";
import { normalizeSchwabOrders, type NormalizedOrderRow } from "@/lib/schwab-orders";
import { loadValidTraderToken } from "@/lib/market-data";

/**
 * Pulls Schwab orders for the given window and upserts them into
 * order_history. Fills never change once recorded, so `order_id` as the
 * primary key makes this safe to call repeatedly — an incremental sync and a
 * full backfill are the same operation, just with a different `days` value.
 *
 * Note the window filters on Schwab's *entered* time, not fill time, so the
 * nightly sync window has to be comfortably wider than the longest order that
 * might sit working before it fills — otherwise a GTC order entered outside
 * the window fills and is never picked up.
 *
 * Returns null when there's no valid Schwab session to sync from.
 */
export async function syncOrderHistory(days: number): Promise<{ synced: number } | null> {
  const token = await loadValidTraderToken();
  if (!token) return null;

  const nums = await getAccountNumbers(token);
  const hash = nums[0]?.hashValue;
  if (!hash) return null;

  const raw = await getAccountOrders(token, hash, days);
  const orders: NormalizedOrderRow[] = normalizeSchwabOrders(raw);
  if (orders.length === 0) return { synced: 0 };

  const admin = createAdminClient();
  // Long backfills are fetched in chunked windows, so the same order can come
  // back twice at a chunk boundary. Postgres rejects an upsert batch that hits
  // the same conflict key twice, so collapse duplicates before sending.
  const byId = new Map<string, NormalizedOrderRow>();
  for (const o of orders) {
    if (o.timestamp) byId.set(o.orderId, o);
  }
  const rows = [...byId.values()].map((o) => ({
    order_id: o.orderId,
    ticker: o.ticker,
    side: o.side,
    quantity: o.quantity,
    fill_price: o.fillPrice,
    status: o.status,
    order_time: o.timestamp,
  }));

  const { error } = await admin.from("order_history").upsert(rows, { onConflict: "order_id" });
  if (error) throw error;

  return { synced: rows.length };
}

/**
 * Earliest BUY fill per ticker, from the persisted order history — the
 * closest honest answer to "when did we buy this" available: Schwab's basic
 * positions endpoint doesn't return an acquisition date (that needs its
 * separate tax-lot endpoint, which this app doesn't call). Empty until
 * order_history has been backfilled/synced at least once.
 */
export async function getFirstBuyDates(tickers: string[]): Promise<Record<string, string>> {
  if (tickers.length === 0) return {};
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("order_history")
      .select("ticker, order_time")
      .in("ticker", tickers)
      .eq("side", "BUY")
      .order("order_time", { ascending: true });
    if (error || !data) return {};

    const firstByTicker: Record<string, string> = {};
    for (const row of data) {
      if (!firstByTicker[row.ticker]) firstByTicker[row.ticker] = row.order_time;
    }
    return firstByTicker;
  } catch {
    return {};
  }
}

export type OrderHistoryRow = {
  orderId: string;
  ticker: string;
  side: "BUY" | "SELL";
  quantity: number;
  fillPrice: number;
  status: string;
  timestamp: string;
};

/** Reads persisted order history from Supabase — no live Schwab call, instant. */
export async function getOrderHistory(days: number): Promise<OrderHistoryRow[]> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("order_history")
    .select("order_id, ticker, side, quantity, fill_price, status, order_time")
    .gte("order_time", since)
    .order("order_time", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((r) => ({
    orderId: r.order_id,
    ticker: r.ticker,
    side: r.side as "BUY" | "SELL",
    quantity: Number(r.quantity),
    fillPrice: Number(r.fill_price),
    status: r.status,
    timestamp: r.order_time,
  }));
}
