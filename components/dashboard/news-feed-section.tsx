"use client";

import { useEffect, useState } from "react";

type Article = {
  title?: string;
  description?: string;
  url?: string;
  publishedAt?: string;
  source?: { name?: string };
};

export function NewsFeedSection({ tickers }: { tickers: string[] }) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const q = tickers.filter(Boolean).slice(0, 12);
    if (!q.length) {
      queueMicrotask(() => setArticles([]));
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/news?tickers=${encodeURIComponent(q.join(","))}`);
        const json = (await res.json()) as { ok?: boolean; articles?: Article[]; message?: string };
        if (!cancelled) {
          if (!res.ok || !json.ok) setErr(json.message ?? "News unavailable");
          else {
            setErr(null);
            setArticles(json.articles ?? []);
          }
        }
      } catch {
        if (!cancelled) setErr("Could not load news.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tickers]);

  if (!tickers.length) {
    return (
      <section className="panel p-4">
        <p className="caps-label">News</p>
        <h2 className="text-sm font-semibold text-white">Holdings &amp; watchlist</h2>
        <p className="mt-2 text-xs text-zinc-500">Add watchlist tickers or open equity positions to see headlines.</p>
      </section>
    );
  }

  return (
    <section className="panel overflow-hidden">
      <div className="px-3 py-2.5">
        <p className="caps-label">News</p>
        <h2 className="text-sm font-semibold text-white">Holdings &amp; watchlist</h2>
      </div>
      <div className="max-h-[360px] divide-y divide-white/[0.06] overflow-y-auto">
        {err ? (
          <p className="px-3 py-4 text-xs text-rose-400">{err}</p>
        ) : articles.length === 0 ? (
          <p className="px-3 py-4 text-xs text-zinc-500">No articles returned (check NEWS_API_KEY).</p>
        ) : (
          articles.map((a, i) => (
            <a
              key={i}
              href={a.url ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="block px-3 py-2.5 transition hover:bg-white/[0.03]"
            >
              <p className="text-xs font-medium text-white line-clamp-2">{a.title}</p>
              <p className="mt-0.5 text-[10px] text-zinc-500">
                {a.source?.name ?? "—"} · {a.publishedAt ? new Date(a.publishedAt).toLocaleString() : ""}
              </p>
            </a>
          ))
        )}
      </div>
    </section>
  );
}
