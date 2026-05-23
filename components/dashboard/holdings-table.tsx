"use client";

import { useState } from "react";
import type { LivePosition } from "@/lib/types";
import { ChevronUp, ChevronDown } from "lucide-react";

const SECTOR_COLORS: Record<string, string> = {
  "Technology":            "#a78bfa",
  "Healthcare":            "#34d399",
  "Financials":            "#60a5fa",
  "Financial Services":    "#60a5fa",
  "Consumer Cyclical":     "#fbbf24",
  "Consumer Defensive":    "#fb923c",
  "Industrials":           "#fb7185",
  "Communication Services":"#22d3ee",
  "Communication":         "#22d3ee",
  "Energy":                "#facc15",
  "Basic Materials":       "#94a3b8",
  "Materials":             "#94a3b8",
  "Real Estate":           "#f472b6",
  "Utilities":             "#a3e635",
};

function fmtUsd(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}
function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}
function colorClass(n: number) {
  return n > 0 ? "text-emerald-400" : n < 0 ? "text-rose-400" : "text-zinc-400";
}

type SortKey = keyof LivePosition;
type SortDir = "asc" | "desc";

function SortIcon({ sortKey, k, sortDir }: { sortKey: SortKey; k: SortKey; sortDir: SortDir }) {
  if (sortKey !== k) return null;
  return sortDir === "asc" ? <ChevronUp className="inline h-2.5 w-2.5" /> : <ChevronDown className="inline h-2.5 w-2.5" />;
}

export function HoldingsTable({ livePositions }: { livePositions?: LivePosition[] | null }) {
  const positions = livePositions ?? [];
  const [sortKey, setSortKey] = useState<SortKey>("weight");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [sectorFilter, setSectorFilter] = useState("All");

  const sectors = ["All", ...new Set(positions.map((p) => p.sector ?? "Unknown").filter(Boolean))];

  const filtered = positions.filter((p) =>
    sectorFilter === "All" || (p.sector ?? "Unknown") === sectorFilter,
  );

  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortKey] as number | string;
    const bv = b[sortKey] as number | string;
    const cmp = typeof av === "string" ? (av as string).localeCompare(bv as string) : ((av as number) - (bv as number));
    return sortDir === "asc" ? cmp : -cmp;
  });

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(["ticker", "name", "sector", "assetType"].includes(key) ? "asc" : "desc");
    }
  }

  const thCls = "px-3 py-2 font-medium cursor-pointer hover:text-zinc-200 transition-colors select-none";
  const thR = `${thCls} text-right`;

  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.04] px-3 py-2">
        <div className="min-w-0">
          <p className="caps text-[10px] text-zinc-500">Portfolio Holdings</p>
          <h2 className="whitespace-nowrap text-[13.5px] font-semibold text-white">
            Live Positions{" "}
            <span className="ml-1 text-[11px] font-normal tabular-nums text-zinc-500">({sorted.length})</span>
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {sectors.length > 1 && (
            <select
              value={sectorFilter}
              onChange={(e) => setSectorFilter(e.target.value)}
              className="rounded-[6px] border border-white/[0.06] bg-black/30 px-2 py-[3px] text-[10.5px] text-zinc-300 outline-none hover:text-white"
            >
              {sectors.map((s) => (
                <option key={s} value={s} className="bg-zinc-900">
                  {s === "All" ? "All sectors" : s}
                </option>
              ))}
            </select>
          )}
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/15 bg-emerald-500/10 px-1.5 py-[1px] text-[10px] font-medium text-emerald-400">
            <span className="h-1 w-1 rounded-full bg-emerald-400" /> Live
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] table-fixed text-[10.5px]">
          <thead className="bg-white/[0.015] text-left text-zinc-500">
            <tr>
              <th className={thCls} onClick={() => handleSort("ticker")}>Ticker <SortIcon sortKey={sortKey} k="ticker" sortDir={sortDir} /></th>
              <th className={thCls} onClick={() => handleSort("name")}>Name <SortIcon sortKey={sortKey} k="name" sortDir={sortDir} /></th>
              <th className={thCls} onClick={() => handleSort("sector")}>Sector <SortIcon sortKey={sortKey} k="sector" sortDir={sortDir} /></th>
              <th className={thCls} onClick={() => handleSort("assetType")}>Type <SortIcon sortKey={sortKey} k="assetType" sortDir={sortDir} /></th>
              <th className={thR} onClick={() => handleSort("quantity")}>Qty <SortIcon sortKey={sortKey} k="quantity" sortDir={sortDir} /></th>
              <th className={thR} onClick={() => handleSort("avgCost")}>Avg Cost <SortIcon sortKey={sortKey} k="avgCost" sortDir={sortDir} /></th>
              <th className={thR} onClick={() => handleSort("currentPrice")}>Price <SortIcon sortKey={sortKey} k="currentPrice" sortDir={sortDir} /></th>
              <th className={thR} onClick={() => handleSort("marketValue")}>Mkt Value <SortIcon sortKey={sortKey} k="marketValue" sortDir={sortDir} /></th>
              <th className={thR} onClick={() => handleSort("unrealizedPnl")}>Unreal P&amp;L <SortIcon sortKey={sortKey} k="unrealizedPnl" sortDir={sortDir} /></th>
              <th className={thR} onClick={() => handleSort("unrealizedPnlPct")}>Unreal % <SortIcon sortKey={sortKey} k="unrealizedPnlPct" sortDir={sortDir} /></th>
              <th className={thR} onClick={() => handleSort("dayPnl")}>Day P&amp;L <SortIcon sortKey={sortKey} k="dayPnl" sortDir={sortDir} /></th>
              <th className={thR} onClick={() => handleSort("dayPnlPct")}>Day % <SortIcon sortKey={sortKey} k="dayPnlPct" sortDir={sortDir} /></th>
              <th className={thR} onClick={() => handleSort("weight")}>Weight <SortIcon sortKey={sortKey} k="weight" sortDir={sortDir} /></th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={13} className="px-3 py-6 text-center text-zinc-500">
                  {positions.length === 0
                    ? "No positions found. Holdings will appear here after securities are purchased."
                    : "No positions match this filter."}
                </td>
              </tr>
            ) : (
              sorted.map((pos) => {
                const sectorColor = SECTOR_COLORS[pos.sector ?? ""] ?? "#94a3b8";
                return (
                  <tr key={pos.ticker} className="border-b border-white/[0.025] text-zinc-200 transition hover:bg-white/[0.02] last:border-b-0">
                    <td className="px-3 py-1.5 font-semibold text-white">{pos.ticker}</td>
                    <td className="max-w-[120px] truncate px-3 py-1.5 text-zinc-300">{pos.name}</td>
                    <td className="px-3 py-1.5">
                      <span className="inline-flex items-center gap-1.5 text-zinc-400">
                        <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: sectorColor }} />
                        {pos.sector ?? "—"}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-zinc-500">{pos.assetType}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{pos.quantity.toLocaleString()}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{fmtUsd(pos.avgCost)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-medium text-white">{fmtUsd(pos.currentPrice)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{fmtUsd(pos.marketValue)}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums font-medium ${colorClass(pos.unrealizedPnl)}`}>{fmtUsd(pos.unrealizedPnl)}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums ${colorClass(pos.unrealizedPnlPct)}`}>{fmtPct(pos.unrealizedPnlPct)}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums ${colorClass(pos.dayPnl)}`}>{fmtUsd(pos.dayPnl)}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums ${colorClass(pos.dayPnlPct)}`}>{fmtPct(pos.dayPnlPct)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-8 overflow-hidden rounded-full bg-white/[0.06]" style={{ height: 3 }}>
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${Math.min(100, pos.weight * 5)}%`, background: sectorColor }}
                          />
                        </div>
                        <span className="w-10 text-right text-zinc-300">{pos.weight.toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {sorted.length > 0 && (
        <div className="flex items-center justify-between border-t border-white/[0.04] px-3 py-1.5 text-[10.5px] text-zinc-500">
          <span>Showing {sorted.length} of {positions.length}</span>
          <span className="tabular-nums">Total weight: {sorted.reduce((s, p) => s + p.weight, 0).toFixed(1)}%</span>
        </div>
      )}
    </section>
  );
}
