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
 * Anything traded today keeps the broker's figure, since only the broker
 * knows what was paid for today's shares. Stocks, funds and options are
 * checked; bonds are quoted per 100 of par and not reliably quoted at all.
 */
export function checkDayPnl(
  positions: LivePosition[],
  quotes: Record<string, SchwabQuoteResponse> | null,
  sessionStarted: boolean,
  tradedToday: ReadonlySet<string>,
): LivePosition[] {
  if (!quotes || !sessionStarted) return positions;

  return positions.map((p) => {
    if (p.quantity === 0 || tradedToday.has(p.ticker.toUpperCase())) return p;
    const cls = assetClassOf(p.assetType);
    if (cls !== "Equity" && cls !== "Option") return p;
    const multiplier = cls === "Option" ? (p.optionMultiplier ?? 100) : 1;
    const q = quotes[p.ticker]?.quote;
    const close = typeof q?.closePrice === "number" && q.closePrice > 0 ? q.closePrice : null;
    const lives = [q?.lastPrice, q?.mark].filter((v): v is number => typeof v === "number" && v > 0);
    if (close == null || !lives.length) return p;

    // p.quantity is already signed, so a short gains as the price falls.
    const expected = lives.map((live) => p.quantity * multiplier * (live - close));
    const tolerance = (Math.abs(p.marketValue) * DAY_PNL_TOLERANCE_PCT) / 100 + DAY_PNL_TOLERANCE_USD;
    if (expected.some((e) => Math.abs(p.dayPnl - e) <= tolerance)) return p;

    const live = lives[0];
    return {
      ...p,
      dayPnl: expected[0],
      dayPnlPct: ((live - close) / close) * 100,
      brokerDayPnl: p.dayPnl,
    };
  });
}

/**
 * Symbols with shares actually filled on `today` (a New York date), for
 * checkDayPnl's exemption.
 *
 * Only a fill changes what the broker's day P&L has to account for. On Nov 10
 * 2026 any order dated today counted, so stops placed or replaced on CPNG, LNG
 * and ABVX exempted all three, and Schwab's −$7.8K for the day stood while the
 * prices behind it had barely moved. The fill time comes from the execution
 * legs where Schwab gives them, since a working order filled today may have
 * been entered days ago.
 */
export function filledTodaySymbols(orders: NormalizedOrderRow[], today: string): Set<string> {
  return new Set(
    orders
      .filter((o) => o.filledQuantity > 0)
      .filter((o) => {
        const at = o.lastFillTime ?? o.timestamp;
        return !!at && nyDate(at) === today;
      })
      .map((o) => o.ticker.toUpperCase()),
  );
}
