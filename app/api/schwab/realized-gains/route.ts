import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidTraderToken } from "@/lib/market-data";
import { getAccountNumbers, getAccountOrders } from "@/lib/schwab";
import { normalizeSchwabOrders } from "@/lib/schwab-orders";

export async function POST() {
  const token = await getValidTraderToken();
  if (!token) {
    return NextResponse.json({ ok: false, message: "No valid Schwab token." }, { status: 401 });
  }

  const admin = createAdminClient();

  // Get account hash needed for the orders endpoint
  let accountHash: string;
  try {
    const accounts = await getAccountNumbers(token);
    const hash = accounts[0]?.hashValue;
    if (!hash) throw new Error("No account hash found.");
    accountHash = hash;
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "Failed to get account hash." },
      { status: 500 },
    );
  }

  // Fetch 90 days of orders and normalize
  let orders;
  try {
    const raw = await getAccountOrders(token, accountHash, 90);
    orders = normalizeSchwabOrders(raw);
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "Failed to fetch orders." },
      { status: 500 },
    );
  }

  const filledOrders = orders.filter((o) => o.status === "FILLED" || o.status === "filled");
  const sells = filledOrders.filter((o) => o.side === "SELL" && o.fillPrice > 0 && o.quantity > 0);
  const buys = filledOrders.filter((o) => o.side === "BUY" && o.fillPrice > 0 && o.quantity > 0);

  if (sells.length === 0) {
    return NextResponse.json({ ok: true, upserted: 0, message: "No filled sell orders found." });
  }

  // Fetch last known avg_cost per ticker from holdings_snapshots (populated by the sync route)
  const sellTickers = [...new Set(sells.map((s) => s.ticker))];
  const { data: snapshots } = await admin
    .from("holdings_snapshots")
    .select("ticker, avg_cost, captured_at")
    .in("ticker", sellTickers)
    .not("avg_cost", "is", null)
    .order("captured_at", { ascending: false });

  const snapshotCost: Record<string, number> = {};
  for (const row of snapshots ?? []) {
    if (row.ticker && row.avg_cost != null && !(row.ticker in snapshotCost)) {
      snapshotCost[row.ticker] = Number(row.avg_cost);
    }
  }

  // Build BUY weighted-average cost per ticker as fallback
  const buyVwap: Record<string, { totalCost: number; totalQty: number }> = {};
  for (const b of buys) {
    if (!buyVwap[b.ticker]) buyVwap[b.ticker] = { totalCost: 0, totalQty: 0 };
    buyVwap[b.ticker].totalCost += b.fillPrice * b.quantity;
    buyVwap[b.ticker].totalQty += b.quantity;
  }
  const buyCostBasis: Record<string, number> = {};
  for (const [ticker, { totalCost, totalQty }] of Object.entries(buyVwap)) {
    if (totalQty > 0) buyCostBasis[ticker] = totalCost / totalQty;
  }

  type GainRow = {
    ticker: string;
    shares_sold: number;
    fill_price: number;
    cost_basis: number;
    filled_at: string;
    order_id: string;
  };

  const rows: GainRow[] = sells.flatMap((sell) => {
    const costBasis = snapshotCost[sell.ticker] ?? buyCostBasis[sell.ticker];
    if (costBasis == null || costBasis <= 0) return [];
    return [{
      ticker: sell.ticker,
      shares_sold: sell.quantity,
      fill_price: sell.fillPrice,
      cost_basis: costBasis,
      filled_at: sell.timestamp || new Date().toISOString(),
      order_id: sell.orderId,
    }];
  });

  if (rows.length === 0) {
    return NextResponse.json({
      ok: true,
      upserted: 0,
      message: "No sell orders with resolvable cost basis. Run a portfolio sync first to capture avg_cost.",
    });
  }

  const { error } = await admin
    .from("realized_gains")
    .upsert(rows, { onConflict: "order_id", ignoreDuplicates: true });

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, upserted: rows.length });
}
