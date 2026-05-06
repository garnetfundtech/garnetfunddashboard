"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Ban, Download, Search } from "lucide-react";
import { Highlight } from "@/components/dashboard/highlight";
import { ResearchUploadModal } from "@/components/dashboard/research-upload-modal";
import type { ResearchItem } from "@/lib/types";

export function ResearchTableClient({
  items,
  tickers,
}: {
  items: ResearchItem[];
  tickers: string[];
}) {
  const [query, setQuery] = useState("");
  const [tickerFilter, setTickerFilter] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesQuery =
        !q ||
        item.title.toLowerCase().includes(q) ||
        item.ticker.toLowerCase().includes(q) ||
        item.author.toLowerCase().includes(q);
      const matchesTicker = !tickerFilter || item.ticker === tickerFilter;
      return matchesQuery && matchesTicker;
    });
  }, [items, query, tickerFilter]);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="glass-input flex h-[42px] flex-1 items-center gap-2 px-3">
          <Search className="h-4 w-4 shrink-0 text-zinc-500" />
          <input
            className="w-full bg-transparent text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
            placeholder="Search research by title, ticker, or user"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          className="glass-input h-[42px] bg-transparent px-3 text-sm text-zinc-300 outline-none"
          value={tickerFilter}
          onChange={(e) => setTickerFilter(e.target.value)}
        >
          <option value="">All tickers</option>
          {tickers.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <ResearchUploadModal />
      </div>

      {/* Table */}
      <section className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-zinc-400">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Title</th>
              <th className="px-4 py-2 text-left font-medium">Ticker</th>
              <th className="px-4 py-2 text-left font-medium">Uploaded by</th>
              <th className="px-4 py-2 text-left font-medium">Date</th>
              <th className="px-4 py-2 text-left font-medium">File</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-zinc-500">
                  {items.length === 0
                    ? "No research reports yet. Upload the first one above."
                    : "No results match your search."}
                </td>
              </tr>
            ) : (
              filtered.map((item) => (
                <tr key={item.id} className="odd:bg-white/[0.015]">
                  <td className="px-4 py-3 text-white">
                    <Highlight text={item.title} query={query} />
                  </td>
                  <td className="px-4 py-3 text-white">
                    <Highlight text={item.ticker} query={query} />
                  </td>
                  <td className="px-4 py-3 text-white">
                    <Highlight text={item.author} query={query} />
                  </td>
                  <td className="px-4 py-3 text-white">{item.updatedAt}</td>
                  <td className="px-4 py-3">
                    {item.downloadEnabled && item.downloadUrl ? (
                      <Link
                        href={item.downloadUrl}
                        className="inline-flex items-center justify-center rounded-[7px] p-1.5 text-white transition-colors hover:bg-white/5"
                        title="Download"
                      >
                        <Download className="h-4 w-4" />
                      </Link>
                    ) : (
                      <Ban className="h-4 w-4 text-white opacity-30" />
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
