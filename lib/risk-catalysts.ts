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

const FMP_BASE = "https://financialmodelingprep.com/stable";

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

/**
 * The macro releases worth surfacing. FMP's economic calendar carries hundreds
 * of series a week, the overwhelming majority of which nobody trades; this is
 * the shortlist a long/short book actually reacts to.
 */
const MACRO_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /consumer price index|^cpi\b|core cpi/i, label: "CPI" },
  { pattern: /producer price index|^ppi\b/i, label: "PPI" },
  { pattern: /pce price index|core pce/i, label: "PCE" },
  { pattern: /fomc|federal funds rate|interest rate decision|rate decision/i, label: "FOMC" },
  { pattern: /non.?farm payroll|employment change|unemployment rate/i, label: "Employment" },
  { pattern: /\bgdp\b/i, label: "GDP" },
  { pattern: /initial jobless claims/i, label: "Jobless claims" },
  { pattern: /ism (manufacturing|services)/i, label: "ISM" },
  { pattern: /retail sales/i, label: "Retail sales" },
  { pattern: /consumer confidence|consumer sentiment/i, label: "Consumer sentiment" },
];

function classifyMacro(event: string): string | null {
  for (const { pattern, label } of MACRO_PATTERNS) {
    if (pattern.test(event)) return label;
  }
  return null;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * US macro releases in the window, filtered to the shortlist above.
 *
 * Only US events: the fund is a US long/short book, and a German ZEW print in
 * the list is noise that makes the ones that matter harder to see.
 */
async function fetchMacroCalendar(days: number): Promise<Catalyst[]> {
  const key = process.env.FMP_API_KEY;
  if (!key) return [];

  const from = iso(new Date());
  const to = iso(new Date(Date.now() + days * 86_400_000));
  const url = `${FMP_BASE}/economic-calendar?from=${from}&to=${to}&apikey=${encodeURIComponent(key)}`;

  try {
    const res = await fetch(url, { next: { revalidate: 21_600 } });
    if (!res.ok) return [];
    const rows = (await res.json()) as Record<string, unknown>[];
    if (!Array.isArray(rows)) return [];

    const out: Catalyst[] = [];
    for (const row of rows) {
      const country = String(row.country ?? "").toUpperCase();
      if (country && country !== "US" && country !== "USA" && country !== "UNITED STATES") continue;

      const event = String(row.event ?? "");
      const label = classifyMacro(event);
      if (!label) continue;

      const raw = String(row.date ?? "");
      const date = raw.slice(0, 10);
      if (!date) continue;

      const impactRaw = String(row.impact ?? "").toLowerCase();
      out.push({
        date,
        kind: "macro",
        label,
        detail: event,
        impact: impactRaw === "high" || impactRaw === "medium" || impactRaw === "low" ? impactRaw : null,
        held: false,
      });
    }

    // The same release often appears more than once (headline and core), which
    // is one calendar entry to a reader.
    const seen = new Set<string>();
    return out.filter((c) => {
      const k = `${c.date}:${c.label}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  } catch {
    return [];
  }
}

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
  /** Why the list is empty, when it is. */
  note: string | null;
};

/**
 * The combined calendar, soonest first, with held earnings ahead of macro on
 * the same day — a print that moves the whole market matters, but a name the
 * fund actually owns reporting that morning matters more to this book.
 */
export async function getCatalysts(heldSymbols: string[], days = 30): Promise<CatalystFeed> {
  if (!process.env.FMP_API_KEY) {
    return {
      items: [],
      available: false,
      note: "No market-data API key is configured, so the calendar cannot be loaded.",
    };
  }

  const held = new Set(heldSymbols.map((s) => s.toUpperCase()));
  const [macro, earnings] = await Promise.all([
    fetchMacroCalendar(days),
    fetchHeldEarnings(days, held),
  ]);

  const items = [...earnings, ...macro].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.held !== b.held) return a.held ? -1 : 1;
    return a.label.localeCompare(b.label);
  });

  return {
    items,
    available: true,
    note: items.length ? null : `No tracked releases or holding earnings in the next ${days} days.`,
  };
}
