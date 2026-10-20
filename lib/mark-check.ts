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
