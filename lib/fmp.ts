/**
 * Financial Modeling Prep API (server-side).
 * Requires FMP_API_KEY.
 */

// FMP “stable” base (per 2026 docs)
const FMP_BASE = "https://financialmodelingprep.com/stable";

export type FmpEarningRow = {
  symbol: string;
  date: string;
  epsEstimated: number | null;
  eps: number | null;
  name?: string;
};

export type FmpProfile = {
  symbol: string;
  companyName?: string;
  sector?: string;
  industry?: string;
};

export async function fetchEarningsCalendar(from: string, to: string): Promise<FmpEarningRow[]> {
  const key = process.env.FMP_API_KEY;
  if (!key) throw new Error("Missing FMP_API_KEY");
  const url = `${FMP_BASE}/earnings-calendar?from=${from}&to=${to}&apikey=${encodeURIComponent(key)}`;
  // Earnings dates barely move intraday — cache for an hour, shared across users.
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`FMP earnings failed: ${res.status}`);
  const data = (await res.json()) as Record<string, unknown>[];
  if (!Array.isArray(data)) return [];
  return data.map((row) => ({
    symbol: String(row.symbol ?? ""),
    date: String(row.date ?? (row as { dateTime?: string }).dateTime ?? "").slice(0, 10),
    epsEstimated: row.epsEstimated != null ? Number(row.epsEstimated) : null,
    eps: (row as { epsActual?: number }).epsActual != null ? Number((row as { epsActual?: number }).epsActual) : (row.eps != null ? Number(row.eps) : null),
    name: row.name != null ? String(row.name) : undefined,
  }));
}

/**
 * Ticker → sector for an arbitrary symbol list, skipping anything FMP can't
 * place. Each profile lookup is cached for an hour by `fetchProfile`, so
 * repeat renders of the same watchlist cost nothing.
 *
 * Tickers absent from the result have no known sector — callers should render
 * that as "unknown" rather than substituting a default sector.
 */
export async function fetchSectorsByTicker(
  tickers: string[],
): Promise<Record<string, string>> {
  if (!process.env.FMP_API_KEY || !tickers.length) return {};

  const unique = [...new Set(tickers.map((t) => t.toUpperCase()))];
  const entries = await Promise.all(
    unique.map(async (symbol) => {
      try {
        const profile = await fetchProfile(symbol);
        return profile?.sector ? ([symbol, profile.sector] as const) : null;
      } catch {
        return null;
      }
    }),
  );

  return Object.fromEntries(entries.filter((e) => e !== null));
}

export async function fetchProfile(symbol: string): Promise<FmpProfile | null> {
  const key = process.env.FMP_API_KEY;
  if (!key) return null;
  const s = symbol.toUpperCase();
  const url = `${FMP_BASE}/profile?symbol=${encodeURIComponent(s)}&apikey=${encodeURIComponent(key)}`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return null;
  const arr = (await res.json()) as Record<string, unknown>[];
  const row = arr?.[0];
  if (!row) return null;
  return {
    symbol: String(row.symbol ?? s),
    companyName: row.companyName != null ? String(row.companyName) : undefined,
    sector: row.sector != null ? String(row.sector) : undefined,
    industry: row.industry != null ? String(row.industry) : undefined,
  };
}

export type TreasuryRates = { date: string; month3: number | null };

/**
 * 3-month U.S. Treasury bill yield — the Fund's return benchmark and the
 * risk-free rate for Sharpe [Spec §3.3, §6; Committee decision 9/2/26].
 *
 * Returns null rather than a stand-in when the feed is unavailable: §1 rule 2
 * requires a card to go grey rather than show a silently wrong number, and a
 * benchmark the Advisory Board sees is exactly the wrong place to guess.
 */
export async function fetchTreasuryRate(): Promise<TreasuryRates | null> {
  const key = process.env.FMP_API_KEY;
  if (!key) return null;
  const to = new Date();
  const from = new Date(to.getTime() - 10 * 86_400_000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const url = `${FMP_BASE}/treasury-rates?from=${iso(from)}&to=${iso(to)}&apikey=${encodeURIComponent(key)}`;
  try {
    const res = await fetch(url, { next: { revalidate: 21_600 } });
    if (!res.ok) return null;
    const rows = (await res.json()) as Record<string, unknown>[];
    if (!Array.isArray(rows) || !rows.length) return null;
    // Newest first is not guaranteed; sort so a stale row never wins.
    const sorted = [...rows].sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));
    const latest = sorted[0];
    const raw = latest.month3 ?? latest.month3Yield ?? latest["3month"];
    const month3 = raw == null ? null : Number(raw);
    return {
      date: String(latest.date ?? iso(to)),
      month3: month3 != null && Number.isFinite(month3) ? month3 : null,
    };
  } catch {
    return null;
  }
}
