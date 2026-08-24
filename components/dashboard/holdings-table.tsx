"use client";

import { useState } from "react";
import type { LivePosition } from "@/lib/types";
import { ChevronUp, ChevronDown } from "lucide-react";
import { SECTOR_COLORS, SECTOR_FALLBACK_COLOR } from "@/lib/sectors";

function fmtUsd(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}
function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}
function fmtDate(iso: string | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function colorClass(n: number) {
  return n > 0 ? "text-pos" : n < 0 ? "text-neg" : "text-ink-2";
}

type SortKey = keyof LivePosition;
type SortDir = "asc" | "desc";

function SortIcon({ sortKey, k, sortDir }: { sortKey: SortKey; k: SortKey; sortDir: SortDir }) {
  if (sortKey !== k) return null;
  return sortDir === "asc" ? <ChevronUp className="inline h-2.5 w-2.5" /> : <ChevronDown className="inline h-2.5 w-2.5" />;
}

export function HoldingsTable({
  livePositions,
  purchaseDates = {},
}: {
  livePositions?: LivePosition[] | null;
  purchaseDates?: Record<string, string>;
}) {
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
      setSortDir(["ticker", "name", "sector"].includes(key) ? "asc" : "desc");
    }
  }

  const thCls = "px-3 py-1.5 font-medium cursor-pointer hover:text-ink transition-colors select-none";
  const thR = `${thCls} text-right`;

  return (
    <section className="panel flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2">
        <div className="min-w-0">
          <p className="caps text-[11px] text-ink-3">Portfolio Holdings</p>
          <h2 className="whitespace-nowrap text-[15px] font-semibold text-ink">
            Positions{" "}
            <span className="ml-1 text-[13px] font-normal tabular-nums text-ink-3">({sorted.length})</span>
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {sectors.length > 1 && (
            <select
              value={sectorFilter}
              onChange={(e) => setSectorFilter(e.target.value)}
              className="rounded-none border border-line bg-paper-3 px-2 py-[3px] text-[12px] text-ink outline-none hover:text-ink"
            >
              {sectors.map((s) => (
                <option key={s} value={s} className="bg-ink">
                  {s === "All" ? "All sectors" : s}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[980px] table-fixed text-[12px]">
          <thead className="bg-paper-3 text-left text-ink-3">
            <tr>
              <th className={thCls} onClick={() => handleSort("ticker")}>Ticker <SortIcon sortKey={sortKey} k="ticker" sortDir={sortDir} /></th>
              <th className={thCls} onClick={() => handleSort("name")}>Name <SortIcon sortKey={sortKey} k="name" sortDir={sortDir} /></th>
              <th className={thCls} onClick={() => handleSort("sector")}>Sector <SortIcon sortKey={sortKey} k="sector" sortDir={sortDir} /></th>
              <th className={thCls}>Purchased</th>
              <th className={thR} onClick={() => handleSort("quantity")}>Qty <SortIcon sortKey={sortKey} k="quantity" sortDir={sortDir} /></th>
              <th className={thR} onClick={() => handleSort("avgCost")}>Avg Cost <SortIcon sortKey={sortKey} k="avgCost" sortDir={sortDir} /></th>
              <th className={thR} onClick={() => handleSort("currentPrice")}>Price <SortIcon sortKey={sortKey} k="currentPrice" sortDir={sortDir} /></th>
              <th className={thR} onClick={() => handleSort("marketValue")}>Mkt Value <SortIcon sortKey={sortKey} k="marketValue" sortDir={sortDir} /></th>
              <th className={thR} onClick={() => handleSort("unrealizedPnl")}>Open P&amp;L <SortIcon sortKey={sortKey} k="unrealizedPnl" sortDir={sortDir} /></th>
              <th className={thR} onClick={() => handleSort("unrealizedPnlPct")}>Open % <SortIcon sortKey={sortKey} k="unrealizedPnlPct" sortDir={sortDir} /></th>
              <th className={thR} onClick={() => handleSort("dayPnl")}>Day P&amp;L <SortIcon sortKey={sortKey} k="dayPnl" sortDir={sortDir} /></th>
              <th className={thR} onClick={() => handleSort("dayPnlPct")}>Day % <SortIcon sortKey={sortKey} k="dayPnlPct" sortDir={sortDir} /></th>
              <th className={thR} onClick={() => handleSort("weight")}>Weight <SortIcon sortKey={sortKey} k="weight" sortDir={sortDir} /></th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={13} className="px-3 py-6 text-center text-ink-3">
                  {positions.length === 0
                    ? "No positions found. Holdings will appear here after securities are purchased."
                    : "No positions match this filter."}
                </td>
              </tr>
            ) : (
              sorted.map((pos) => {
                const sectorColor = SECTOR_COLORS[pos.sector ?? ""] ?? SECTOR_FALLBACK_COLOR;
                return (
                  <tr key={pos.ticker} className="border-b border-line text-ink transition hover:bg-paper-3 last:border-b-0">
                    <td className="px-3 py-1 font-semibold text-ink">{pos.ticker}</td>
                    <td className="max-w-[120px] truncate px-3 py-1 text-ink">{pos.name}</td>
                    <td className="px-3 py-1">
                      <span className="inline-flex items-center gap-1.5 text-ink-2">
                        <span className="h-1.5 w-1.5 rounded-none shrink-0" style={{ background: sectorColor }} />
                        <span className="whitespace-nowrap">{pos.sector ?? "—"}</span>
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-1 tabular-nums text-ink-2">{fmtDate(purchaseDates[pos.ticker])}</td>
                    <td className="px-3 py-1 text-right tabular-nums">{pos.quantity.toLocaleString()}</td>
                    <td className="px-3 py-1 text-right tabular-nums">{fmtUsd(pos.avgCost)}</td>
                    <td className="px-3 py-1 text-right tabular-nums font-medium text-ink">{fmtUsd(pos.currentPrice)}</td>
                    <td className="px-3 py-1 text-right tabular-nums">{fmtUsd(pos.marketValue)}</td>
                    <td className={`px-3 py-1 text-right tabular-nums font-medium ${colorClass(pos.unrealizedPnl)}`}>{fmtUsd(pos.unrealizedPnl)}</td>
                    <td className={`px-3 py-1 text-right tabular-nums ${colorClass(pos.unrealizedPnlPct)}`}>{fmtPct(pos.unrealizedPnlPct)}</td>
                    <td className={`px-3 py-1 text-right tabular-nums ${colorClass(pos.dayPnl)}`}>{fmtUsd(pos.dayPnl)}</td>
                    <td className={`px-3 py-1 text-right tabular-nums ${colorClass(pos.dayPnlPct)}`}>{fmtPct(pos.dayPnlPct)}</td>
                    <td className="px-3 py-1 text-right tabular-nums">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-8 overflow-hidden rounded-none bg-paper-2" style={{ height: 3 }}>
                          <div
                            className="h-full rounded-none"
                            style={{ width: `${Math.min(100, pos.weight * 5)}%`, background: sectorColor }}
                          />
                        </div>
                        <span className="w-10 text-right text-ink">{pos.weight.toFixed(1)}%</span>
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
        <div className="flex items-center justify-between border-t border-line px-3 py-1.5 text-[12px] text-ink-3">
          <span>Showing {sorted.length} of {positions.length}</span>
          <span className="tabular-nums">Total weight: {sorted.reduce((s, p) => s + p.weight, 0).toFixed(1)}%</span>
        </div>
      )}
    </section>
  );
}
