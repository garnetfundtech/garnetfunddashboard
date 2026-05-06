/**
 * SEC EDGAR — Form 4 insider transactions (no API key).
 * Requires a descriptive User-Agent per SEC fair access policy.
 */

const SEC_DATA = "https://data.sec.gov";
const SEC_TICKERS_JSON = "https://www.sec.gov/files/company_tickers.json";

type TickerEntry = { cik_str: number; ticker: string; title: string };

let tickerCache: Map<string, { cik: string; title: string }> | null = null;

async function loadTickerMap(): Promise<Map<string, { cik: string; title: string }>> {
  if (tickerCache) return tickerCache;
  const res = await fetch(SEC_TICKERS_JSON, {
    headers: { "User-Agent": "GarnetFundDashboard/1.0 (contact@garnetfund.edu)" },
    next: { revalidate: 86400 },
  });
  if (!res.ok) throw new Error(`SEC tickers failed: ${res.status}`);
  const raw = (await res.json()) as Record<string, TickerEntry> | TickerEntry[];
  const rows: TickerEntry[] = Array.isArray(raw) ? raw : Object.values(raw ?? {});
  const map = new Map<string, { cik: string; title: string }>();
  for (const row of rows) {
    const t = String(row.ticker ?? "").toUpperCase();
    if (!t) continue;
    const cik = String(row.cik_str).padStart(10, "0");
    map.set(t, { cik, title: row.title ?? "" });
  }
  tickerCache = map;
  return map;
}

export type InsiderFiling = {
  form: string;
  filedAt: string;
  accessionNumber: string;
  primaryDocument: string;
  url: string;
};

function cikToPath(cik: string) {
  const n = cik.replace(/^0+/, "") || "0";
  return n;
}

export async function fetchRecentForm4ForTicker(
  ticker: string,
  max = 8,
): Promise<InsiderFiling[]> {
  const map = await loadTickerMap();
  const entry = map.get(ticker.toUpperCase());
  if (!entry) return [];

  const subUrl = `${SEC_DATA}/submissions/CIK${entry.cik}.json`;
  const res = await fetch(subUrl, {
    headers: { "User-Agent": "GarnetFundDashboard/1.0 (contact@garnetfund.edu)" },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const json = (await res.json()) as {
    filings?: {
      recent?: {
        form?: string[];
        filingDate?: string[];
        accessionNumber?: string[];
        primaryDocument?: string[];
      };
    };
  };

  const recent = json.filings?.recent;
  if (!recent?.form?.length) return [];

  const out: InsiderFiling[] = [];
  const forms = recent.form;
  const dates = recent.filingDate ?? [];
  const acc = recent.accessionNumber ?? [];
  const docs = recent.primaryDocument ?? [];

  for (let i = 0; i < forms.length && out.length < max; i++) {
    if (forms[i] !== "4") continue;
    const accession = acc[i];
    if (!accession) continue;
    const cikPath = cikToPath(entry.cik);
    const accClean = accession.replace(/-/g, "");
    const doc = docs[i] ?? "xslF345X03/wf-form4_1764823454.xml";
    const url = `https://www.sec.gov/Archives/edgar/data/${cikPath}/${accClean}/${doc}`;
    out.push({
      form: "4",
      filedAt: dates[i] ?? "",
      accessionNumber: accession,
      primaryDocument: doc,
      url,
    });
  }

  return out;
}
