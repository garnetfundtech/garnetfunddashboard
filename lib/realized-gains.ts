/**
 * P&L on positions the fund has sold, which the live positions feed cannot
 * see: once a name is closed it is gone from Schwab's positions, and with it
 * every dollar it made or lost.
 *
 * Two jobs, both priced off the daily risk snapshot (`risk_snapshots`), which
 * holds the book as it stood at each close:
 *
 *   closedTodayDayPnl — today's P&L on anything sold today, measured from the
 *     prior close. Added to the held positions' day P&L so a sale at a loss
 *     still shows in Day P&L on the day it happens.
 *
 *   syncRealizedGains — writes each filled sell into `realized_gains`
 *     against its cost basis, so Total P&L carries closed trades.
 *
 * Prices are quoted in each instrument's own convention. A Treasury's fill
 * price and average cost are per 100 of par while one unit is $1,000 face, so
 * (fill − cost) × units understates a bond's P&L tenfold; options are per
 * share on a 100-share contract. Every dollar figure here goes through
 * `multiplier`, which is read off the snapshot's own dollar values where it
 * can be and falls back to the asset type where it cannot.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import type { NormalizedOrderRow } from "@/lib/schwab-orders";
import type { SnapshotPosition } from "@/lib/risk-live";

type Snapshot = { captured_on: string; positions: SnapshotPosition[] };

/** The New York calendar date of an instant, as YYYY-MM-DD. */
export function nyDate(at: Date | string = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(typeof at === "string" ? new Date(at) : at);
}

/**
 * A sell that closes (part of) a long. A short sale or an option written to
 * open is a SELL too, but it opens a position rather than realizing one.
 */
function closesLong(o: NormalizedOrderRow): boolean {
  if (o.side !== "SELL") return false;
  const ins = (o.instruction ?? "SELL").toUpperCase();
  return ins === "SELL" || ins === "SELL_TO_CLOSE";
}

function isFilled(o: NormalizedOrderRow): boolean {
  return o.status.toUpperCase() === "FILLED" && o.fillPrice > 0 && o.quantity > 0 && !!o.timestamp;
}

/** Quoted price → dollars per unit, by asset type alone. */
function multiplierForAssetType(assetType: string | undefined): number {
  const t = (assetType ?? "").toUpperCase();
  if (t === "FIXED_INCOME" || t === "FIXED INCOME") return 10;
  if (t === "OPTION") return 100;
  return 1;
}

/**
 * Quoted price → dollars per unit for a snapshot position. The dollar cost
 * per unit comes from the snapshot's own market value and return on cost, and
 * its ratio to the quoted average cost is the multiplier. Snapped to a power
 * of ten, since that is all a quoting convention ever differs by.
 */
function multiplierFor(pos: SnapshotPosition, fallbackAssetType?: string): number {
  const qty = Math.abs(Number(pos.quantity));
  const mv = Math.abs(Number(pos.marketValue));
  const avg = Number(pos.avgCost);
  const pct = pos.pnlVsCostPct;
  if (qty > 0 && mv > 0 && avg > 0 && pct != null && Number.isFinite(pct) && pct > -100) {
    const dollarCostPerUnit = mv / qty / (1 + pct / 100);
    const ratio = dollarCostPerUnit / avg;
    if (Number.isFinite(ratio) && ratio > 0) return 10 ** Math.round(Math.log10(ratio));
  }
  const byClass = pos.assetClass === "Fixed Income" ? "FIXED_INCOME" : pos.assetClass === "Option" ? "OPTION" : undefined;
  return multiplierForAssetType(byClass ?? fallbackAssetType);
}

async function loadSnapshots(days: number): Promise<Snapshot[]> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await admin
    .from("risk_snapshots")
    .select("captured_on, positions")
    .gte("captured_on", since)
    .order("captured_on", { ascending: false });
  if (error || !data) return [];
  return data.map((r) => ({
    captured_on: r.captured_on as string,
    positions: (Array.isArray(r.positions) ? r.positions : []) as SnapshotPosition[],
  }));
}

/** The long position in the last close strictly before `day`, if it was held. */
function heldBefore(snapshots: Snapshot[], ticker: string, day: string): SnapshotPosition | null {
  for (const snap of snapshots) {
    if (snap.captured_on >= day) continue;
    const pos = snap.positions.find(
      (p) => p.symbol?.toUpperCase() === ticker.toUpperCase() && p.side !== "short",
    );
    // Newest first, so the first close before the sale is the one that counts —
    // whether or not the name was in it.
    return pos ?? null;
  }
  return null;
}

/**
 * Today's P&L, from the prior close, on everything sold today.
 *
 * Schwab's per-position day P&L covers what is still held. A name sold
 * outright drops off the feed entirely, and a partial sale leaves only the
 * remaining units in it, so the sold units are priced here: proceeds less
 * their value at yesterday's close. A name bought and sold the same day had no
 * prior close and is skipped.
 */
export async function closedTodayDayPnl(orders: NormalizedOrderRow[]): Promise<number> {
  const today = nyDate();
  const sells = orders.filter((o) => isFilled(o) && closesLong(o) && nyDate(o.timestamp) === today);
  if (!sells.length) return 0;

  const snapshots = await loadSnapshots(10);
  let total = 0;
  for (const sell of sells) {
    const prev = heldBefore(snapshots, sell.ticker, today);
    if (!prev) continue;
    const prevQty = Math.abs(Number(prev.quantity));
    if (!(prevQty > 0)) continue;
    const prevDollarsPerUnit = Math.abs(Number(prev.marketValue)) / prevQty;
    const mult = multiplierFor(prev, sell.assetType);
    total += sell.quantity * (sell.fillPrice * mult - prevDollarsPerUnit);
  }
  return total;
}

/**
 * Records every filled sell in `orders` into `realized_gains`.
 *
 * Cost basis, in order of preference: the average cost in the last close
 * before the sale; the last holdings sync before the sale; the average fill of
 * the buys in the same window. Rows are updated in place by order id, so a
 * re-run corrects anything an earlier, less informed run wrote.
 */
export async function syncRealizedGains(orders: NormalizedOrderRow[]): Promise<{ upserted: number }> {
  const sells = orders.filter((o) => isFilled(o) && closesLong(o));
  if (!sells.length) return { upserted: 0 };

  const admin = createAdminClient();
  const oldest = sells.reduce((m, s) => (s.timestamp < m ? s.timestamp : m), sells[0].timestamp);
  const lookbackDays = Math.ceil((Date.now() - new Date(oldest).getTime()) / 86_400_000) + 10;
  const snapshots = await loadSnapshots(lookbackDays);

  const tickers = [...new Set(sells.map((s) => s.ticker))];
  const { data: holdings } = await admin
    .from("holdings_snapshots")
    .select("ticker, avg_cost, captured_at")
    .in("ticker", tickers)
    .not("avg_cost", "is", null)
    .order("captured_at", { ascending: false });

  const buyVwap = new Map<string, { cost: number; qty: number }>();
  for (const b of orders) {
    if (!isFilled(b) || b.side !== "BUY") continue;
    const agg = buyVwap.get(b.ticker) ?? { cost: 0, qty: 0 };
    agg.cost += b.fillPrice * b.quantity;
    agg.qty += b.quantity;
    buyVwap.set(b.ticker, agg);
  }

  const rows = sells.flatMap((sell) => {
    const day = nyDate(sell.timestamp);
    const prev = heldBefore(snapshots, sell.ticker, day);
    let costBasis: number | null = null;
    let multiplier = multiplierForAssetType(sell.assetType);

    if (prev && Number(prev.avgCost) > 0) {
      costBasis = Number(prev.avgCost);
      multiplier = multiplierFor(prev, sell.assetType);
    } else {
      const synced = (holdings ?? []).find(
        (h) => h.ticker === sell.ticker && String(h.captured_at) < sell.timestamp,
      );
      if (synced && Number(synced.avg_cost) > 0) costBasis = Number(synced.avg_cost);
      else {
        const vwap = buyVwap.get(sell.ticker);
        if (vwap && vwap.qty > 0) costBasis = vwap.cost / vwap.qty;
      }
    }
    if (costBasis == null || !(costBasis > 0)) return [];

    return [
      {
        ticker: sell.ticker,
        shares_sold: sell.quantity,
        fill_price: sell.fillPrice,
        cost_basis: costBasis,
        multiplier,
        filled_at: sell.timestamp,
        order_id: sell.orderId,
      },
    ];
  });

  if (!rows.length) return { upserted: 0 };
  const { error } = await admin.from("realized_gains").upsert(rows, { onConflict: "order_id" });
  if (error) throw new Error(`realized_gains upsert failed: ${error.message}`);
  return { upserted: rows.length };
}
