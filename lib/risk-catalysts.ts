/**
 * Upcoming catalysts — the macro releases and earnings dates that move the
 * book before anyone has a chance to react to them.
 *
 * Not part of the Wave 1 spec: this is the Risk Manager's own request, on the
 * reasoning that a position monitor which only reports what already happened
 * is a rear-view mirror. Knowing CPI lands on Thursday is what lets a stop be
 * checked on Wednesday.
 *
 * Both feeds come from FMP. With no API key configured, every function here
 * returns an empty list and the panel says why rather than rendering an
 * unexplained blank — the same rule §1 applies to every other card.
 */
import { fetchEarningsCalendar } from "@/lib/fmp";
import { fetchFredCalendar } from "@/lib/fred";

export type CatalystKind = "macro" | "earnings";

export type Catalyst = {
  date: string;
  kind: CatalystKind;
  /** "CPI", "FOMC Rate Decision", or a ticker for earnings. */
  label: string;
  detail: string | null;
  /** How much this one historically moves markets, where the feed says. */
  impact: "high" | "medium" | "low" | null;
  /** Set when the fund holds the name, so held earnings sort to the top. */
  held: boolean;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Earnings dates, with the fund's own holdings marked. */
async function fetchHeldEarnings(days: number, held: Set<string>): Promise<Catalyst[]> {
  if (!process.env.FMP_API_KEY) return [];
  const from = iso(new Date());
  const to = iso(new Date(Date.now() + days * 86_400_000));

  try {
    const rows = await fetchEarningsCalendar(from, to);
    return rows
      .filter((r) => held.has(String(r.symbol ?? "").toUpperCase()))
      .map((r) => ({
        date: String(r.date ?? "").slice(0, 10),
        kind: "earnings" as const,
        label: String(r.symbol ?? "").toUpperCase(),
        detail: "Earnings",
        impact: "high" as const,
        held: true,
      }))
      .filter((c) => c.date);
  } catch {
    return [];
  }
}

export type CatalystFeed = {
  items: Catalyst[];
  available: boolean;
  /** Why the list is empty or partial, when it is. */
  note: string | null;
  /** True when the macro calendar could not be loaded at all. */
  macroRestricted?: boolean;
};

/**
 * The combined calendar, soonest first, with held earnings ahead of macro on
 * the same day — a print that moves the whole market matters, but a name the
 * fund actually owns reporting that morning matters more to this book.
 */
export async function getCatalysts(heldSymbols: string[], days = 30): Promise<CatalystFeed> {
  const held = new Set(heldSymbols.map((s) => s.toUpperCase()));
  const [macro, earnings] = await Promise.all([
    fetchFredCalendar(days),
    fetchHeldEarnings(days, held),
  ]);

  const macroItems: Catalyst[] = macro.items.map((m) => ({
    date: m.date,
    kind: "macro",
    label: m.label,
    detail: m.name,
    impact: null,
    held: false,
  }));

  const items = [...earnings, ...macroItems].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.held !== b.held) return a.held ? -1 : 1;
    return a.label.localeCompare(b.label);
  });

  // Said plainly rather than left as an absence: FOMC decision dates are not
  // in FRED's release calendar at all, and a reader who sees CPI and payrolls
  // listed would otherwise reasonably assume rate decisions were covered too.
  const notes: string[] = [];
  if (!macro.available) notes.push(macro.note ?? "The macro calendar is unavailable.");
  if (macro.dropped.length) {
    notes.push(`No published forward schedule for: ${macro.dropped.join(", ")}.`);
  }
  notes.push("FOMC decision dates are not published in FRED's release calendar.");
  if (!process.env.FMP_API_KEY) notes.push("Earnings need a market-data API key.");
  if (!items.length) notes.push(`Nothing else scheduled in the next ${days} days.`);

  return {
    items,
    available: macro.available || Boolean(process.env.FMP_API_KEY),
    note: notes.join(" "),
    macroRestricted: !macro.available,
  };
}
