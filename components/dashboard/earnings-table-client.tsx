"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { FmpEarningRow } from "@/lib/fmp";

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

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const sym = r.symbol.toUpperCase();
      if (filter === "held") return heldSet.has(sym);
      if (filter === "watch") return watchSet.has(sym);
      return true;
    });
  }, [rows, filter, heldSet, watchSet]);

  return (
    <div className="space-y-3">
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
              "rounded-[8px] px-3 py-1.5 text-xs font-medium transition",
              filter === k ? "bg-[#8e0604] text-white" : "bg-white/[0.04] text-zinc-400 hover:bg-white/10",
            )}
          >
            {lab}
          </button>
        ))}
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
                  return (
                    <tr
                      key={`${sym}-${r.date}-${i}`}
                      className={cn(
                        "border-t border-white/[0.04] text-zinc-200",
                        held && "bg-[#8e0604]/12",
                      )}
                    >
                      <td className="px-3 py-2 font-semibold text-white">{sym}</td>
                      <td className="px-3 py-2 text-zinc-300">{r.name ?? "—"}</td>
                      <td className="px-3 py-2">{r.date}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {r.epsEstimated != null ? r.epsEstimated.toFixed(2) : "—"}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{r.eps != null ? r.eps.toFixed(2) : "—"}</td>
                      <td className="px-3 py-2">
                        {held ? (
                          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                            Holding
                          </span>
                        ) : watch ? (
                          <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-medium text-sky-300">
                            Watching
                          </span>
                        ) : (
                          <span className="text-zinc-600">—</span>
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
