import { getValidTraderToken, fetchMarketOverview, fetchPortfolioSummary } from "@/lib/market-data";
import { fetchEarningsCalendar } from "@/lib/fmp";

export type ApiHealth = {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
  usedEndpoints: string[];
  totalOffered: string;
};

function okRow(
  key: string,
  label: string,
  usedEndpoints: string[],
  totalOffered: string,
  detail = "Connected",
): ApiHealth {
  return { key, label, ok: true, detail, usedEndpoints, totalOffered };
}

function badRow(
  key: string,
  label: string,
  usedEndpoints: string[],
  totalOffered: string,
  detail: string,
): ApiHealth {
  return { key, label, ok: false, detail, usedEndpoints, totalOffered };
}

/**
 * Only the two integrations the app actually depends on. FRED, NewsAPI,
 * SEC EDGAR, and Gemini were wired up as status checks only — no page or
 * component ever called them — so they were removed rather than shown as
 * permanently "missing key".
 */
export async function getExternalApiStatus(): Promise<ApiHealth[]> {
  const out: ApiHealth[] = [];

  // Schwab (Trader + Market Data) — inferred from token + live fetches used across the dashboard.
  const schwabUsed = [
    "OAuth: /v1/oauth/authorize, /v1/oauth/token",
    "Trader: /trader/v1/accounts?fields=positions",
    "Trader: /trader/v1/accounts/accountNumbers",
    "Trader: /trader/v1/accounts/{hash}/orders",
    "Market: /marketdata/v1/quotes?fields=quote,fundamental",
    "Market: /marketdata/v1/pricehistory",
    "Market: /marketdata/v1/movers/{index}",
    "Market: /marketdata/v1/markets",
  ];

  const token = await getValidTraderToken();
  if (!token) {
    out.push(
      badRow(
        "schwab",
        "Schwab (Trader + Market Data)",
        schwabUsed,
        "25",
        "No valid Schwab token (or needs re-auth)",
      ),
    );
  } else {
    const [p, m] = await Promise.allSettled([fetchPortfolioSummary(), fetchMarketOverview()]);
    const ok = p.status === "fulfilled" || m.status === "fulfilled";
    out.push(
      ok
        ? okRow(
            "schwab",
            "Schwab (Trader + Market Data)",
            schwabUsed,
            "25",
            "Connected (live fetch verified)",
          )
        : badRow("schwab", "Schwab (Trader + Market Data)", schwabUsed, "25", "Live fetch failed"),
    );
  }

  // FMP
  const fmpUsed = [
    "earning_calendar (upcoming earnings)",
    "profile/{symbol} (sector enrichment)",
    "price-target (optional)",
  ];
  if (!process.env.FMP_API_KEY) {
    out.push(badRow("fmp", "Financial Modeling Prep (FMP)", fmpUsed, "100+", "Missing FMP_API_KEY"));
  } else {
    try {
      const from = new Date().toISOString().slice(0, 10);
      const toDate = new Date();
      toDate.setUTCDate(toDate.getUTCDate() + 7);
      const to = toDate.toISOString().slice(0, 10);
      await fetchEarningsCalendar(from, to);
      out.push(okRow("fmp", "Financial Modeling Prep (FMP)", fmpUsed, "100+", "Connected"));
    } catch (e) {
      out.push(badRow("fmp", "Financial Modeling Prep (FMP)", fmpUsed, "100+", e instanceof Error ? e.message : "FMP error"));
    }
  }

  return out;
}
