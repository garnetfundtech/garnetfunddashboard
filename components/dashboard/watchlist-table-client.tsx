"use client";

import { useMemo, useState, useTransition } from "react";
import { Bell, ChevronDown, ChevronUp, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { KpiRow } from "@/components/dashboard/kpi-row";
import { TableShell } from "@/components/dashboard/table-shell";
import { GhostBtn, PrimaryBtn } from "@/components/dashboard/buttons";
import { Spark } from "@/components/dashboard/spark";
import type { SchwabQuoteResponse } from "@/lib/schwab";
import type { WatchlistRow, UserRole } from "@/lib/types";
import { addWatchlistItemAction, removeWatchlistItemAction } from "@/app/(dashboard)/watchlist/actions";
import { SECTOR_COLORS, SECTOR_FALLBACK_COLOR } from "@/lib/sectors";

function fmtUsd(n: number | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function fmtPct(n: number | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function trendClass(n: number | undefined) {
  if (n == null) return "text-zinc-400";
  if (n > 0) return "text-emerald-400";
  if (n < 0) return "text-rose-400";
  return "text-zinc-400";
}

type SortKey = "ticker" | "price" | "changePct" | "adder";
type SortDir = "asc" | "desc";

function parseTarget(raw: string | null): string {
  if (!raw) return "—";
  const num = parseFloat(raw.replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(num)) return raw;
  return num.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

export function WatchlistTableClient({
  rows,
  quotes,
  sectorByTicker,
  actor,
  pitchOptions,
}: {
  rows: WatchlistRow[];
  quotes: Record<string, SchwabQuoteResponse>;
  /** Ticker → sector. Missing keys mean the sector is unknown, not defaulted. */
  sectorByTicker: Record<string, string>;
  actor: { id: string; role: UserRole };
  pitchOptions: { id: string; ticker: string; thesis: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("ticker");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [pending, startTransition] = useTransition();
  const [newTicker, setNewTicker] = useState("");

  const elevated =
    actor.role === "pm" || actor.role === "admin" || actor.role === "developer";

  const merged = useMemo(() => {
    return rows.map((r) => {
      const q = quotes[r.ticker]?.quote ?? {};
      const price = q.lastPrice ?? q.mark ?? q.closePrice;
      const changePct = q.netPercentChange;
      return {
        ...r,
        price: typeof price === "number" ? price : undefined,
        changePct: typeof changePct === "number" ? changePct : undefined,
      };
    });
  }, [rows, quotes]);

  const sorted = useMemo(() => {
    const mul = sortDir === "asc" ? 1 : -1;
    return [...merged].sort((a, b) => {
      if (sortKey === "ticker") return a.ticker.localeCompare(b.ticker) * mul;
      if (sortKey === "price") return ((a.price ?? 0) - (b.price ?? 0)) * mul;
      if (sortKey === "changePct")
        return ((a.changePct ?? 0) - (b.changePct ?? 0)) * mul;
      if (sortKey === "adder") return a.adderName.localeCompare(b.adderName) * mul;
      return 0;
    });
  }, [merged, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "ticker" || key === "adder" ? "asc" : "desc");
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return null;
    return sortDir === "asc" ? (
      <ChevronUp className="ml-0.5 inline h-2.5 w-2.5" />
    ) : (
      <ChevronDown className="ml-0.5 inline h-2.5 w-2.5" />
    );
  }

  function handleRemove(id: string) {
    const fd = new FormData();
    fd.set("id", id);
    startTransition(() => removeWatchlistItemAction(fd));
  }

  const avgChangePct =
    merged.length > 0
      ? merged.reduce((s, r) => s + (r.changePct ?? 0), 0) / merged.length
      : null;

  const kpiTiles = [
    { label: "Tickers watched", value: String(rows.length), sub: "On the radar" },
    {
      label: "Avg day %",
      value: avgChangePct != null ? fmtPct(avgChangePct) : "—",
      sub: "Portfolio-weighted",
      tone: avgChangePct != null ? (avgChangePct >= 0 ? ("pos" as const) : ("neg" as const)) : null,
    },
    { label: "With alerts", value: "—", sub: "Price alerts set" },
    { label: "Avg time on list", value: "—", sub: "Days since added" },
    { label: "Coverage overlap", value: "—", sub: "With fund positions" },
  ];

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        kicker="Watchlist"
        title="On the Radar"
        subtitle="Tickers being researched but not yet in the portfolio."
        actions={
          <>
            <GhostBtn>
              <Bell className="h-3.5 w-3.5" />
              Set alert
            </GhostBtn>
            <PrimaryBtn onClick={() => setOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Add ticker
            </PrimaryBtn>
          </>
        }
      />

      <KpiRow tiles={kpiTiles} />

      <TableShell
        title="Watchlist"
        count={sorted.length}
        actions={
          <span className="rounded-full border border-white/[0.06] bg-white/[0.03] px-2 py-[1px] text-[10px] text-zinc-400">
            Sortable
          </span>
        }
      >
        <table className="w-full min-w-[560px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500">
              {(
                [
                  ["ticker", "Ticker"],
                  ["price", "Price"],
                  ["changePct", "Day %"],
                  ["adder", "Added by"],
                ] as [SortKey, string][]
              ).map(([key, label]) => (
                <th
                  key={key}
                  className={`px-3 py-2 font-medium ${key === "price" || key === "changePct" ? "text-right" : ""}`}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(key)}
                    className={`hover:text-zinc-200 ${sortKey === key ? "text-zinc-200" : ""}`}
                  >
                    {label}
                    <SortIcon col={key} />
                  </button>
                </th>
              ))}
              <th className="px-3 py-2 font-medium">Target</th>
              <th className="px-3 py-2 font-medium">30D</th>
              <th className="px-3 py-2 text-right font-medium" />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-12 text-center text-[11.5px] text-zinc-500"
                >
                  No tickers on the watchlist yet.
                </td>
              </tr>
            )}
            {sorted.map((row) => {
              // Undefined when FMP has no sector for this ticker (or no API key
              // is configured) — the dot is omitted rather than guessed.
              const sector: string | undefined = sectorByTicker[row.ticker];

              return (
                <tr
                  key={row.id}
                  className="border-b border-white/[0.025] last:border-b-0 transition hover:bg-white/[0.02]"
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      {sector && (
                        <span
                          title={sector}
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{
                            background:
                              SECTOR_COLORS[sector] ?? SECTOR_FALLBACK_COLOR,
                          }}
                        />
                      )}
                      <span className="text-[12px] font-semibold text-white">
                        {row.ticker}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[12px] text-zinc-200">
                    {fmtUsd(row.price)}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums text-[12px] ${trendClass(row.changePct)}`}>
                    {fmtPct(row.changePct)}
                  </td>
                  <td className="px-3 py-2 text-[12px] text-zinc-400">
                    {row.adderName}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-[12px] text-zinc-400">
                    {parseTarget(row.analystTarget)}
                  </td>
                  <td className="px-3 py-2">
                    <Spark
                      data={[0]}
                      width={56}
                      height={16}
                      stroke={
                        (row.changePct ?? 0) >= 0 ? "#34d399" : "#fb7185"
                      }
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {elevated && (
                        <button
                          type="button"
                          onClick={() => handleRemove(row.id)}
                          disabled={pending}
                          className="rounded p-1 text-zinc-500 hover:bg-white/[0.05] hover:text-rose-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        className="rounded p-1 text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableShell>

      {/* Add ticker form */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm">
          <div className="panel w-full max-w-sm p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="caps-label">Watchlist</p>
                <h2 className="text-base font-semibold text-white">
                  Add ticker
                </h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-[8px] p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white"
              >
                ×
              </button>
            </div>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                startTransition(async () => {
                  await addWatchlistItemAction(fd);
                  setOpen(false);
                  setNewTicker("");
                });
              }}
            >
              <input
                name="ticker"
                value={newTicker}
                onChange={(e) =>
                  setNewTicker(
                    e.target.value.toUpperCase().replace(/[^A-Z]/g, ""),
                  )
                }
                className="glass-input w-full px-3 py-2.5 text-sm uppercase text-zinc-200 outline-none placeholder:text-zinc-500"
                placeholder="Ticker (e.g. NVDA)"
                required
              />
              <select
                name="pitchId"
                className="glass-input w-full bg-transparent px-3 py-2.5 text-sm text-zinc-300 outline-none"
              >
                <option value="">No pitch linked</option>
                {pitchOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.ticker} — {p.thesis.slice(0, 40)}
                  </option>
                ))}
              </select>
              <input
                name="analystTarget"
                className="glass-input w-full px-3 py-2.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
                placeholder="Analyst target (optional)"
              />
              <textarea
                name="notes"
                rows={2}
                className="glass-input w-full resize-none px-3 py-2.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
                placeholder="Notes (optional)"
              />
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-[10px] px-4 py-2 text-sm text-zinc-400 hover:bg-white/5 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="inline-flex items-center gap-2 rounded-[10px] bg-[var(--gf-accent)] px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
