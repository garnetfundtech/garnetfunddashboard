import { getValidTraderToken, fetchMarketOverview, fetchPortfolioSummary } from "@/lib/market-data";
import { fetchFredSeries } from "@/lib/fred";
import { fetchEarningsCalendar } from "@/lib/fmp";
import { fetchRecentForm4ForTicker } from "@/lib/edgar";
import { GoogleGenerativeAI } from "@google/generative-ai";

const GEMINI_MODEL_ID = process.env.GEMINI_MODEL || "gemini-flash-latest";

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

  // FRED
  const fredUsed = ["fred/series/observations (T10Y2Y,CPIAUCSL,PCEPILFE,DFF,UNRATE)"];
  if (!process.env.FRED_API_KEY) {
    out.push(badRow("fred", "FRED", fredUsed, "20", "Missing FRED_API_KEY"));
  } else {
    try {
      const obs = await fetchFredSeries("T10Y2Y", { observationStart: "2024-01-01" });
      out.push(
        obs.length
          ? okRow("fred", "FRED", fredUsed, "20", "Connected")
          : badRow("fred", "FRED", fredUsed, "20", "No observations returned"),
      );
    } catch (e) {
      out.push(badRow("fred", "FRED", fredUsed, "20", e instanceof Error ? e.message : "FRED error"));
    }
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

  // NewsAPI
  const newsUsed = ["newsapi.org/v2/everything (holdings/watchlist headlines)"];
  if (!process.env.NEWS_API_KEY) {
    out.push(badRow("newsapi", "NewsAPI", newsUsed, "3", "Missing NEWS_API_KEY"));
  } else {
    try {
      const params = new URLSearchParams({
        q: "\"SPY\"",
        language: "en",
        sortBy: "publishedAt",
        pageSize: "1",
        apiKey: process.env.NEWS_API_KEY,
      });
      const res = await fetch(`https://newsapi.org/v2/everything?${params}`, { cache: "no-store" });
      if (!res.ok) {
        out.push(badRow("newsapi", "NewsAPI", newsUsed, "3", `HTTP ${res.status}`));
      } else {
        out.push(okRow("newsapi", "NewsAPI", newsUsed, "3", "Connected"));
      }
    } catch (e) {
      out.push(badRow("newsapi", "NewsAPI", newsUsed, "3", e instanceof Error ? e.message : "NewsAPI error"));
    }
  }

  // SEC EDGAR
  const secUsed = ["data.sec.gov/company_tickers.json", "data.sec.gov/submissions/CIK##########.json"];
  try {
    // Lightweight check: try to fetch one ticker’s Form 4 index if any holdings exist; otherwise just validate tickers file.
    const portfolio = await fetchPortfolioSummary();
    const sym = portfolio?.positions?.[0]?.ticker ?? "AAPL";
    await fetchRecentForm4ForTicker(sym, 1);
    out.push(okRow("sec", "SEC EDGAR", secUsed, "10", "Connected"));
  } catch (e) {
    out.push(badRow("sec", "SEC EDGAR", secUsed, "10", e instanceof Error ? e.message : "SEC error"));
  }

  // Gemini
  const geminiUsed = ["Gemini 1.5 Flash: analyze (PDF)", "Gemini 1.5 Flash: chat", "Gemini 1.5 Flash: macro briefing"];
  if (!process.env.GEMINI_API_KEY) {
    out.push(badRow("gemini", "Google Gemini", geminiUsed, "8", "Missing GEMINI_API_KEY"));
  } else {
    try {
      const gen = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = gen.getGenerativeModel({ model: GEMINI_MODEL_ID });
      const r = await model.generateContent("Respond with exactly: OK");
      const text = r.response.text().trim();
      out.push(
        text.toUpperCase().includes("OK")
          ? okRow("gemini", "Google Gemini", geminiUsed, "8", "Connected")
          : okRow("gemini", "Google Gemini", geminiUsed, "8", "Connected (non-OK response)"),
      );
    } catch (e) {
      out.push(badRow("gemini", "Google Gemini", geminiUsed, "8", e instanceof Error ? e.message : "Gemini error"));
    }
  }

  return out;
}

