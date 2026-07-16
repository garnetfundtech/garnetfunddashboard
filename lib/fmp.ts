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
