/**
 * Live positions whose broker value matches no quote, repriced from the quote.
 *
 * Schwab's account feed values each position on its own, apart from its quote
 * feed, and the two have disagreed: on Oct 14 and again on Oct 20 2026 the
 * account feed valued 1,815 CLOA at an implied $59.6 a share while every quote
 * was near $51.85. Its day P&L for the position is that value less the real
 * prior close, so the whole $14.1K error landed in Day P&L, and in NAV, weight
 * and open P&L beside it.
 *
 * The broker's figures are kept whenever they agree with the quote, because
 * its day P&L accounts for shares bought or sold today and a quote cannot.
 * Only stocks and funds are checked: options and bonds are quoted per contract
 * or per 100 of par, so quantity × quote is not their value (the nightly
 * check in broker-check.ts draws the same line).
 */
import { assetClassOf } from "@/lib/risk-engine";
import type { SchwabQuoteResponse } from "@/lib/schwab";
import type { LivePosition } from "@/lib/types";
import type { NormalizedOrderRow } from "@/lib/schwab-orders";
import { nyDate } from "@/lib/realized-gains";

/** How far the broker's implied price may sit from the nearest quote price. */
const MAX_MARK_GAP_PCT = 2;

export type MarkCorrection = {
  positions: LivePosition[];
  /** Broker market value less quote market value, summed: what NAV is over by. */
  gap: number;
};

export function correctBadMarks(
  positions: LivePosition[],
  quotes: Record<string, SchwabQuoteResponse> | null,
  sessionStarted: boolean,
): MarkCorrection {
  if (!quotes) return { positions, gap: 0 };
  let gap = 0;

  const corrected = positions.map((p) => {
    if (assetClassOf(p.assetType) !== "Equity" || p.quantity === 0) return p;
    const q = quotes[p.ticker]?.quote;
    const live = [q?.lastPrice, q?.mark].find((v): v is number => typeof v === "number" && v > 0);
    const close = typeof q?.closePrice === "number" && q.closePrice > 0 ? q.closePrice : null;
    if (live == null) return p;

    // Generous on purpose: the broker's price has to match none of the
    // quote's prices, so after-hours drift alone never trips it.
    const candidates = [live, q?.mark, close].filter((v): v is number => typeof v === "number" && v > 0);
    const near = candidates.some((c) => Math.abs(p.currentPrice - c) / c <= MAX_MARK_GAP_PCT / 100);
    if (near) return p;

    const shares = Math.abs(p.quantity);
    const sign = p.side === "short" ? -1 : 1;
    const marketValue = sign * shares * live;
    const costBasis = Math.abs(p.marketValue - p.unrealizedPnl);
    const unrealizedPnl = p.unrealizedPnl + (marketValue - p.marketValue);
    const dayPnl = sessionStarted && close != null ? sign * shares * (live - close) : 0;
    gap += p.marketValue - marketValue;

    return {
      ...p,
      currentPrice: live,
      marketValue,
      unrealizedPnl,
      unrealizedPnlPct: costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : 0,
      dayPnl,
      dayPnlPct: sessionStarted && close != null ? ((live - close) / close) * 100 : 0,
      brokerPrice: p.currentPrice,
    };
  });

  return { positions: corrected, gap };
}

/** Slack allowed between the broker's day P&L and the quote's: a share of value plus a flat amount. */
const DAY_PNL_TOLERANCE_PCT = 0.5;
const DAY_PNL_TOLERANCE_USD = 25;

/**
 * Day P&L checked against the quote: units × multiplier × (live − prior close).
 *
 * Schwab's per-position day P&L is measured against what it thinks the
 * account held at the prior close, which is wrong after an account change.
 * The fund moved its book to a new Schwab account on Nov 3 2026 and on Nov 4
 * the dashboard read −$95.3K for the day while the prices behind it had
 * barely moved. The quote knows nothing about accounts, so for a position not
 * traded today it gives the true day P&L directly.
 *
 * A name traded today is checked too, from its fills: the units held since
 * the close move from the close, and the units bought today from what was
 * paid. Units sold today are left out here, since closedTodayDayPnl adds
 * them to the total. On Nov 19 2026 an 80-share CLOA sale exempted the whole
 * 1,600-share position and Schwab's −$86.9K for it stood, while the quote had
 * moved a penny. A name whose fills today include a short sale, a cover or an
 * option written keeps the broker's figure, as before. Stocks, funds and
 * options are checked; bonds are quoted per 100 of par and not reliably
 * quoted at all.
 */
export function checkDayPnl(
  positions: LivePosition[],
  quotes: Record<string, SchwabQuoteResponse> | null,
  sessionStarted: boolean,
  tradedToday: ReadonlyMap<string, TodayFills>,
): LivePosition[] {
  if (!quotes || !sessionStarted) return positions;

  return positions.map((p) => {
    if (p.quantity === 0) return p;
    const fills = tradedToday.get(p.ticker.toUpperCase());
    // Only long positions traded with plain buys and sells are rebuilt.
    if (fills && (!fills.longOnly || p.quantity < 0)) return p;
    const bought = fills?.boughtQty ?? 0;
    const heldSinceClose = p.quantity - bought;
    // Bought more today than is held now: today's buys were partly sold again.
    if (fills && heldSinceClose < 0) return p;

    const cls = assetClassOf(p.assetType);
    if (cls !== "Equity" && cls !== "Option") return p;
    const multiplier = cls === "Option" ? (p.optionMultiplier ?? 100) : 1;
    const q = quotes[p.ticker]?.quote;
    const close = typeof q?.closePrice === "number" && q.closePrice > 0 ? q.closePrice : null;
    const lives = [q?.lastPrice, q?.mark].filter((v): v is number => typeof v === "number" && v > 0);
    if (close == null || !lives.length) return p;

    // p.quantity is already signed, so a short gains as the price falls.
    const expected = lives.map(
      (live) => multiplier * (heldSinceClose * (live - close) + bought * live - (fills?.boughtCost ?? 0)),
    );
    const tolerance = (Math.abs(p.marketValue) * DAY_PNL_TOLERANCE_PCT) / 100 + DAY_PNL_TOLERANCE_USD;
    if (expected.some((e) => Math.abs(p.dayPnl - e) <= tolerance)) return p;

    const live = lives[0];
    // Against what the position was worth at the close plus what was paid today.
    const base = multiplier * (heldSinceClose * close + (fills?.boughtCost ?? 0));
    return {
      ...p,
      dayPnl: expected[0],
      dayPnlPct: base > 0 ? (expected[0] / base) * 100 : ((live - close) / close) * 100,
      brokerDayPnl: p.dayPnl,
    };
  });
}

/** What filled today in one name: units bought and their cost in quoted price units. */
export type TodayFills = {
  boughtQty: number;
  boughtCost: number;
  /** False when a fill today was anything but a plain buy or sell of a long. */
  longOnly: boolean;
};

const LONG_INSTRUCTIONS = new Set(["BUY", "SELL", "BUY_TO_OPEN", "SELL_TO_CLOSE"]);

/**
 * What filled on `today` (a New York date), by symbol, for checkDayPnl.
 *
 * Only a fill counts. On Nov 10 2026 any order dated today did, so stops
 * placed or replaced on CPNG, LNG and ABVX exempted all three, and Schwab's
 * −$7.8K for the day stood while the prices behind it had barely moved. Fills
 * are read from the execution legs where Schwab gives them, so an order
 * entered days ago and filled partly today counts only today's units.
 */
export function filledToday(orders: NormalizedOrderRow[], today: string): Map<string, TodayFills> {
  const out = new Map<string, TodayFills>();
  for (const o of orders) {
    if (!(o.filledQuantity > 0)) continue;
    const legs = o.executions?.length
      ? o.executions
      : [{ time: o.lastFillTime ?? o.timestamp, quantity: o.filledQuantity, price: o.fillPrice }];
    const todays = legs.filter((l) => !!l.time && nyDate(l.time) === today);
    if (!todays.length) continue;

    const key = o.ticker.toUpperCase();
    const f = out.get(key) ?? { boughtQty: 0, boughtCost: 0, longOnly: true };
    if (!LONG_INSTRUCTIONS.has((o.instruction ?? "").toUpperCase())) f.longOnly = false;
    if (o.side === "BUY") {
      for (const l of todays) {
        f.boughtQty += l.quantity;
        f.boughtCost += l.quantity * l.price;
      }
    }
    out.set(key, f);
  }
  return out;
}
