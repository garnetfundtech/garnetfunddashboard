import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/require-session";

/** Registrar roots whose articles are usually keyword noise for ticker searches (package indexes, etc.). */
const BLOCKED_NEWS_DOMAIN_ROOTS = [
  "pypi.org",
  "pythonhosted.org",
  "npmjs.com",
  "npmjs.org",
  "crates.io",
  "rubygems.org",
  "packagist.org",
  "nuget.org",
  "anaconda.org",
  "conda-forge.org",
];

function hostnameBlocked(hostname: string): boolean {
  const h = hostname.toLowerCase();
  for (const root of BLOCKED_NEWS_DOMAIN_ROOTS) {
    if (h === root || h.endsWith(`.${root}`)) return true;
  }
  return false;
}

function filterArticlesByDomain(raw: unknown[]): unknown[] {
  return raw.filter((item) => {
    const url = typeof item === "object" && item !== null && "url" in item ? String((item as { url?: unknown }).url ?? "") : "";
    if (!url) return true;
    try {
      const host = new URL(url).hostname;
      return !hostnameBlocked(host);
    } catch {
      return false;
    }
  });
}

export async function GET(request: NextRequest) {
  const session = await requireSessionUser();
  if (session.response) return session.response;

  const key = process.env.NEWS_API_KEY;
  if (!key) {
    return NextResponse.json({ ok: false, message: "Missing NEWS_API_KEY" }, { status: 503 });
  }

  const tickersParam = request.nextUrl.searchParams.get("tickers") ?? "";
  const tickers = tickersParam.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean).slice(0, 12);
  if (!tickers.length) {
    return NextResponse.json({ ok: true, articles: [] });
  }

  const q = tickers.map((t) => `"${t}"`).join(" OR ");
  const targetCount = 20;
  const params = new URLSearchParams({
    q,
    language: "en",
    sortBy: "publishedAt",
    pageSize: "60",
    apiKey: key,
  });

  try {
    const res = await fetch(`https://newsapi.org/v2/everything?${params}`, { cache: "no-store" });
    const json = (await res.json()) as { status: string; articles?: unknown[]; message?: string };
    if (!res.ok || json.status === "error") {
      return NextResponse.json(
        { ok: false, message: json.message ?? "NewsAPI error" },
        { status: 502 },
      );
    }
    const raw = Array.isArray(json.articles) ? json.articles : [];
    const filtered = filterArticlesByDomain(raw).slice(0, targetCount);
    return NextResponse.json({ ok: true, articles: filtered });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "News fetch failed" },
      { status: 500 },
    );
  }
}
