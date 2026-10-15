/**
 * Whether today's broker figures are believable enough to record.
 *
 * The nightly snapshot writes the NAV series that every return, volatility and
 * Sharpe figure reads, and a wrong day there cannot be corrected by the next
 * one. Schwab's account feed has reported a wrong value before: on Oct 14 2026
 * it marked 1,815 CLOA at $108,174 (an implied $59.60, against a quote near
 * $51.80) for most of the day, with no trade or transfer behind it.
 *
 * Two checks, each against something other than the account feed:
 *
 *   1. Each stock or fund's market value against its quantity times a live
 *      quote. Summed in dollars rather than tested per holding, so a $4 stock
 *      drifting after hours cannot hold the fund's NAV, and the threshold is a
 *      share of NAV because that is what a bad mark would distort.
 *   2. The NAV against the last recorded day. Quotes cannot see a deposit or
 *      a cash balance gone wrong; a move this size is one of those, not
 *      performance.
 *
 * Options, bonds and futures are left to check 2: their prices are quoted per
 * contract or per 100 of par, so quantity × quote is not their market value.
 */
import { getValidTraderToken } from "@/lib/market-data";
import { getQuotes } from "@/lib/schwab";
import type { RiskModel } from "@/lib/risk-engine";

/** Total pricing gap, as a share of NAV, above which the day is held. */
const MAX_PRICING_GAP_PCT = 1;

/**
 * A one-day NAV move beyond this is held. At the IPS's 12% annualized
 * volatility ceiling it is over thirteen standard deviations: a deposit, a
 * withdrawal or bad data, which a person has to tell apart.
 */
const MAX_NAV_MOVE_PCT = 10;

export type BrokerCheck = {
  ok: boolean;
  /** Why the day is held, one sentence each. Empty when ok. */
  problems: string[];
  /** What could not be checked, which does not by itself hold the day. */
  unchecked: string[];
  holdings: {
    symbol: string;
    marketValue: number;
    quoteValue: number;
    gap: number;
  }[];
};

type Quotes = Awaited<ReturnType<typeof getQuotes>>;

/** Live quotes for the symbols, or null when they cannot be had. */
async function liveQuotes(symbols: string[]): Promise<Quotes | null> {
  const token = await getValidTraderToken();
  return token ? getQuotes(token, symbols).catch(() => null) : null;
}

export async function checkBrokerValues(
  model: Pick<RiskModel, "nav" | "positions">,
  lastRecorded: { captured_on: string; nav: number } | null,
  fetchQuotes: (symbols: string[]) => Promise<Quotes | null> = liveQuotes,
): Promise<BrokerCheck> {
  const problems: string[] = [];
  const unchecked: string[] = [];
  const nav = model.nav ?? 0;

  // 1. Market values against live quotes.
  const priced = model.positions
    .map((row) => row.position)
    .filter((p) => p.assetClass === "Equity" && p.quantity !== 0);

  const holdings: BrokerCheck["holdings"] = [];
  let quotes: Quotes | null = null;
  if (priced.length) {
    quotes = await fetchQuotes(priced.map((p) => p.symbol)).catch(() => null);
    // A quote outage is not evidence the account feed is wrong. The day is
    // recorded and the gap in checking is reported, rather than losing a NAV
    // day to the checker's own failure.
    if (!quotes) unchecked.push("Quotes were unavailable, so holdings were not priced independently.");
  }

  if (quotes) {
    for (const p of priced) {
      const q = quotes[p.symbol]?.quote;
      const implied = Math.abs(p.marketValue / p.quantity);
      // The closest of the quote's prices to the account's own: generous on
      // purpose, since the check is for marks that match none of them.
      const candidates = [q?.lastPrice, q?.mark, q?.closePrice].filter(
        (v): v is number => typeof v === "number" && v > 0,
      );
      if (!candidates.length) {
        unchecked.push(`No quote for ${p.symbol}.`);
        continue;
      }
      const ref = candidates.reduce((best, v) => (Math.abs(v - implied) < Math.abs(best - implied) ? v : best));
      const quoteValue = Math.abs(p.quantity) * ref * Math.sign(p.marketValue || 1);
      holdings.push({ symbol: p.symbol, marketValue: p.marketValue, quoteValue, gap: p.marketValue - quoteValue });
    }

    const totalGap = holdings.reduce((s, h) => s + Math.abs(h.gap), 0);
    if (nav > 0 && (totalGap / nav) * 100 > MAX_PRICING_GAP_PCT) {
      const worst = holdings.slice().sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))[0];
      problems.push(
        `Schwab's holding values differ from live quotes by $${totalGap.toFixed(2)} ` +
          `(${((totalGap / nav) * 100).toFixed(1)}% of NAV). Largest: ${worst.symbol}, valued at ` +
          `$${worst.marketValue.toFixed(2)} against $${worst.quoteValue.toFixed(2)} at the quote.`,
      );
    }
  }

  // 2. NAV against the last recorded day.
  if (lastRecorded && lastRecorded.nav > 0 && nav > 0) {
    const move = ((nav - lastRecorded.nav) / lastRecorded.nav) * 100;
    if (Math.abs(move) > MAX_NAV_MOVE_PCT) {
      problems.push(
        `NAV of $${nav.toFixed(2)} is ${move > 0 ? "+" : ""}${move.toFixed(1)}% from ` +
          `$${lastRecorded.nav.toFixed(2)} on ${lastRecorded.captured_on}: a deposit, a withdrawal ` +
          `or bad data rather than a day's performance.`,
      );
    }
  }

  return { ok: problems.length === 0, problems, unchecked, holdings };
}
