"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { FmpEarningRow } from "@/lib/fmp";
import { Search } from "lucide-react";
import { AiChatTrigger } from "@/components/dashboard/ai-chat-panel";
import { Highlight } from "@/components/dashboard/highlight";

type Filter = "all" | "held" | "watch";

export function EarningsTableClient({
  rows,
  heldSet,
  watchSet,
}: {
  rows: FmpEarningRow[];
  heldSet: Set<string>;
  watchSet: Set<string>;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [nowMs] = useState(() => Date.now());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = rows.filter((r) => {
      const sym = r.symbol.toUpperCase();
      if (filter === "held") return heldSet.has(sym);
      if (filter === "watch") return watchSet.has(sym);
      return true;
    });

    const searched = !q
      ? base
      : base.filter((r) => {
          const sym = r.symbol.toUpperCase();
          const company = r.name ?? "";
          const days = Math.ceil((new Date(r.date).getTime() - nowMs) / 86400000);
          const hay = [
            sym,
            company,
            r.date,
            String(days),
            r.epsEstimated != null ? r.epsEstimated.toFixed(2) : "",
            r.eps != null ? r.eps.toFixed(2) : "",
            heldSet.has(sym) ? "holding" : "",
            watchSet.has(sym) ? "watchlist" : "",
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return hay.includes(q);
        });

    // Default sort: soonest → latest
    return [...searched].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [rows, filter, heldSet, watchSet, query, nowMs]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="glass-input flex h-[42px] min-w-[240px] flex-1 items-center gap-2 px-3">
          <Search className="h-4 w-4 shrink-0 text-zinc-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by ticker or company…"
            className="w-full bg-transparent text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["all", "All"],
              ["held", "Held"],
              ["watch", "Watchlist"],
            ] as const
          ).map(([k, lab]) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={cn(
                "h-[42px] rounded-[8px] px-4 text-xs font-medium transition",
                filter === k ? "bg-[#8e0604] text-white" : "bg-white/[0.04] text-zinc-400 hover:bg-white/10",
              )}
            >
              {lab}
            </button>
          ))}
        </div>
        <AiChatTrigger />
      </div>

      <section className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-xs">
            <thead className="bg-white/5 text-zinc-400">
              <tr>
                {["Ticker", "Company", "Report date", "Est. EPS", "Actual EPS", "Fund holds"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-zinc-500">
                    No upcoming earnings in this window (check FMP_API_KEY and date range).
                  </td>
                </tr>
              ) : (
                filtered.map((r, i) => {
                  const sym = r.symbol.toUpperCase();
                  const held = heldSet.has(sym);
                  const watch = watchSet.has(sym);
                  const days = Math.ceil((new Date(r.date).getTime() - nowMs) / 86400000);
                  const daysLabel = Number.isFinite(days) ? `${days} days` : "—";
                  return (
                    <tr
                      key={`${sym}-${r.date}-${i}`}
                      className={cn(
                        "border-t border-white/[0.04] text-zinc-200",
                        held && "bg-[#8e0604]/12",
                      )}
                    >
                      <td className="px-3 py-2 font-semibold text-white">
                        <Highlight text={sym} query={query} />
                      </td>
                      <td className="px-3 py-2 text-zinc-300">
                        <Highlight text={r.name ?? "—"} query={query} />
                      </td>
                      <td className="px-3 py-2">
                        <Highlight text={`${r.date} (${daysLabel})`} query={query} />
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        <Highlight text={r.epsEstimated != null ? r.epsEstimated.toFixed(2) : "—"} query={query} />
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        <Highlight text={r.eps != null ? r.eps.toFixed(2) : "—"} query={query} />
                      </td>
                      <td className="px-3 py-2">
                        {held ? (
                          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                            <Highlight text="Holding" query={query} />
                          </span>
                        ) : watch ? (
                          <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-medium text-sky-300">
                            <Highlight text="Watching" query={query} />
                          </span>
                        ) : (
                          <span className="text-zinc-600"><Highlight text="—" query={query} /></span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
