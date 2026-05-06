/**
 * Server-side FRED (Federal Reserve Economic Data) client.
 * Requires FRED_API_KEY in environment.
 */

export type FredObservation = {
  date: string;
  value: number | null;
};

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";

export async function fetchFredSeries(
  seriesId: string,
  options?: { observationStart?: string; observationEnd?: string },
): Promise<FredObservation[]> {
  const key = process.env.FRED_API_KEY;
  if (!key) {
    throw new Error("Missing FRED_API_KEY");
  }

  const params = new URLSearchParams({
    series_id: seriesId,
    api_key: key,
    file_type: "json",
    sort_order: "asc",
  });
  if (options?.observationStart) params.set("observation_start", options.observationStart);
  if (options?.observationEnd) params.set("observation_end", options.observationEnd);

  const res = await fetch(`${FRED_BASE}?${params}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`FRED request failed: ${res.status}`);
  }
  const json = (await res.json()) as {
    observations?: { date: string; value: string }[];
  };
  const obs = json.observations ?? [];
  return obs.map((o) => ({
    date: o.date,
    value: o.value === "." ? null : Number(o.value),
  }));
}

/** CPI YoY % change from CPIAUCSL (monthly index) */
export function toYearOverYearPct(indexSeries: FredObservation[]): FredObservation[] {
  const sorted = [...indexSeries].filter((o) => o.value != null);
  const out: FredObservation[] = [];
  for (let i = 12; i < sorted.length; i++) {
    const cur = sorted[i].value!;
    const y = sorted[i - 12].value!;
    if (y === 0) continue;
    out.push({
      date: sorted[i].date,
      value: ((cur - y) / y) * 100,
    });
  }
  return out;
}
