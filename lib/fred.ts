/**
 * FRED — the St. Louis Fed's economic release calendar.
 *
 * Used instead of a paid market-data economic calendar: FRED is free, and for
 * "when does CPI land" it is the primary source rather than a reseller of one.
 *
 * Two things about this API had to be established empirically rather than
 * assumed, and both shape the code below.
 *
 * First, release names are precise and must be matched exactly. FRED carries
 * "Consumer Price Index" alongside "Sticky Price CPI", "Research Consumer
 * Price Index" and the European "Harmonized Indices of Consumer Prices", and
 * "Gross Domestic Product" alongside "GDPNow", "GDP-Based Recession Indicator
 * Index" and Eurostat's "National Accounts - GDP". Pattern matching on "CPI"
 * or "GDP" pulls in all of them. So releases are addressed by numeric id.
 *
 * Second, `include_release_dates_with_no_data=true` is required to see future
 * dates at all — but for a release with no published forward schedule, FRED
 * answers with every calendar day instead. "FOMC Press Release" returns 116
 * dates over 120 days, so the eight annual rate decisions are simply not in
 * this calendar, and asking for them yields a daily entry that means nothing.
 * It is excluded, and the cadence guard below stops any other release from
 * doing the same thing if FRED's behaviour changes.
 */
const FRED_BASE = "https://api.stlouisfed.org/fred";

export type FredCadence = "monthly" | "weekly";

export type FredRelease = {
  id: number;
  /** Short label for the calendar chip. */
  label: string;
  /** FRED's own release name, kept so the id can be re-verified later. */
  name: string;
  cadence: FredCadence;
};

/**
 * The releases a long/short equity book actually reacts to, each verified to
 * return a real forward schedule.
 */
export const FRED_RELEASES: FredRelease[] = [
  { id: 10, label: "CPI", name: "Consumer Price Index", cadence: "monthly" },
  { id: 46, label: "PPI", name: "Producer Price Index", cadence: "monthly" },
  { id: 54, label: "PCE", name: "Personal Income and Outlays", cadence: "monthly" },
  { id: 50, label: "Payrolls", name: "Employment Situation", cadence: "monthly" },
  { id: 194, label: "ADP payrolls", name: "ADP National Employment Report", cadence: "monthly" },
  { id: 53, label: "GDP", name: "Gross Domestic Product", cadence: "monthly" },
  { id: 9, label: "Retail sales", name: "Advance Monthly Sales for Retail and Food Services", cadence: "monthly" },
  { id: 180, label: "Jobless claims", name: "Unemployment Insurance Weekly Claims Report", cadence: "weekly" },
];

/** Roughly how many times a cadence fires in a window, for the sanity guard. */
function expectedCount(cadence: FredCadence, days: number): number {
  return cadence === "weekly" ? days / 7 : days / 30;
}

export type FredReleaseDate = { date: string; label: string; name: string };

export type FredCalendar = {
  items: FredReleaseDate[];
  available: boolean;
  /** Releases dropped because FRED returned a daily padding pattern. */
  dropped: string[];
  note: string | null;
};

/**
 * Upcoming release dates across the tracked releases.
 *
 * Each release is queried on its own rather than pulling the whole calendar
 * and filtering: the combined endpoint truncates at its row limit well inside
 * a month, so a busy period would silently lose the releases that matter.
 */
export async function fetchFredCalendar(days = 30): Promise<FredCalendar> {
  const key = process.env.FRED_API_KEY;
  if (!key) {
    return {
      items: [],
      available: false,
      dropped: [],
      note: "No FRED API key is configured, so the macro calendar cannot be loaded.",
    };
  }

  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const from = iso(new Date());
  const to = iso(new Date(Date.now() + days * 86_400_000));

  const results = await Promise.all(
    FRED_RELEASES.map(async (release) => {
      const params = new URLSearchParams({
        release_id: String(release.id),
        api_key: key,
        file_type: "json",
        realtime_start: from,
        realtime_end: to,
        include_release_dates_with_no_data: "true",
        sort_order: "asc",
        limit: "200",
      });
      try {
        const res = await fetch(`${FRED_BASE}/release/dates?${params}`, { next: { revalidate: 21_600 } });
        if (!res.ok) return { release, dates: [] as string[], padded: false };
        const body = (await res.json()) as { release_dates?: { date: string }[] };
        const dates = (body.release_dates ?? []).map((d) => d.date).filter(Boolean);

        // A release with no forward schedule answers with every calendar day.
        // Twice the expected count is generous for a genuine schedule and far
        // below what daily padding produces.
        const padded = dates.length > Math.max(expectedCount(release.cadence, days) * 2, 3);
        return { release, dates: padded ? [] : dates, padded };
      } catch {
        return { release, dates: [] as string[], padded: false };
      }
    }),
  );

  const items: FredReleaseDate[] = [];
  const dropped: string[] = [];
  for (const { release, dates, padded } of results) {
    if (padded) dropped.push(release.label);
    for (const date of dates) {
      items.push({ date, label: release.label, name: release.name });
    }
  }

  items.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));

  return {
    items,
    available: true,
    dropped,
    note: null,
  };
}
