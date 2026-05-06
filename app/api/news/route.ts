import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/require-session";

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
  const params = new URLSearchParams({
    q,
    language: "en",
    sortBy: "publishedAt",
    pageSize: "20",
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
    return NextResponse.json({ ok: true, articles: json.articles ?? [] });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "News fetch failed" },
      { status: 500 },
    );
  }
}
