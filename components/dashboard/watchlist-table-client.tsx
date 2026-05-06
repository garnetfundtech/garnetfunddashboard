"use client";

import { useMemo, useState, useTransition } from "react";
import type { SchwabQuoteResponse } from "@/lib/schwab";
import type { WatchlistRow } from "@/lib/types";
import { addWatchlistItemAction, removeWatchlistItemAction } from "@/app/(dashboard)/watchlist/actions";
import type { UserRole } from "@/lib/types";
import { Plus } from "lucide-react";

function fmtUsd(n: number | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

type SortKey = "ticker" | "price" | "hi" | "lo" | "pe" | "target" | "adder";

export function WatchlistTableClient({
  rows,
  quotes,
  actor,
  pitchOptions,
}: {
  rows: WatchlistRow[];
  quotes: Record<string, SchwabQuoteResponse>;
  actor: { id: string; role: UserRole };
  pitchOptions: { id: string; ticker: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "ticker", dir: "asc" });
  const [pending, startTransition] = useTransition();

  const elevated = actor.role === "pm" || actor.role === "admin" || actor.role === "developer";

  const merged = useMemo(() => {
    return rows.map((r) => {
      const q = quotes[r.ticker]?.quote ?? {};
      const f = quotes[r.ticker]?.fundamental ?? {};
      const price = q.lastPrice ?? q.mark ?? q.closePrice;
      return {
        ...r,
        price: typeof price === "number" ? price : undefined,
        hi: q["52WeekHigh"],
        lo: q["52WeekLow"],
        pe: f.peRatio,
      };
    });
  }, [rows, quotes]);

  const sorted = useMemo(() => {
    const m = [...merged];
    const mul = sort.dir === "asc" ? 1 : -1;
    m.sort((a, b) => {
      switch (sort.key) {
        case "price":
          return ((a.price ?? 0) - (b.price ?? 0)) * mul;
        case "hi":
          return ((a.hi ?? 0) - (b.hi ?? 0)) * mul;
        case "lo":
          return ((a.lo ?? 0) - (b.lo ?? 0)) * mul;
        case "pe":
          return ((a.pe ?? 0) - (b.pe ?? 0)) * mul;
        case "target":
          return (String(a.analystTarget ?? "").localeCompare(String(b.analystTarget ?? ""))) * mul;
        case "adder":
          return a.adderName.localeCompare(b.adderName) * mul;
        default:
          return a.ticker.localeCompare(b.ticker) * mul;
      }
    });
    return m;
  }, [merged, sort]);

  function toggle(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-[10px] bg-[#8e0604] px-3 py-2 text-xs font-medium text-white hover:bg-[#a80705]"
        >
          <Plus className="h-3.5 w-3.5" />
          Add ticker
        </button>
      </div>

      <section className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-xs">
            <thead className="bg-white/5 text-zinc-400">
              <tr>
                {(
                  [
                    ["ticker", "Ticker"],
                    ["price", "Price"],
                    ["hi", "52w High"],
                    ["lo", "52w Low"],
                    ["pe", "P/E"],
                    ["target", "Analyst target"],
                    ["adder", "Added by"],
                  ] as const
                ).map(([k, lab]) => (
                  <th key={k} className="px-3 py-2 text-left font-medium">
                    <button type="button" className="hover:text-white" onClick={() => toggle(k)}>
                      {lab}
                      {sort.key === k ? (sort.dir === "asc" ? "↑" : "↓") : ""}
                    </button>
                  </th>
                ))}
                <th className="px-3 py-2 text-left font-medium">Pipeline</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-zinc-500">
                    No tickers on the watchlist yet. Add one to start tracking.
                  </td>
                </tr>
              ) : (
                sorted.map((r) => (
                  <tr key={r.id} className="odd:bg-white/[0.015] text-zinc-200">
                    <td className="px-3 py-2 font-semibold text-white">{r.ticker}</td>
                    <td className="px-3 py-2 tabular-nums">{fmtUsd(r.price)}</td>
                    <td className="px-3 py-2 tabular-nums">{fmtUsd(r.hi)}</td>
                    <td className="px-3 py-2 tabular-nums">{fmtUsd(r.lo)}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {r.pe != null && Number.isFinite(r.pe) ? r.pe.toFixed(1) : "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-300">{r.analystTarget ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-400">{r.adderName}</td>
                    <td className="px-3 py-2 text-zinc-500">{r.pitchId ? "Linked" : "—"}</td>
                    <td className="px-3 py-2">
                      {r.addedBy === actor.id || elevated ? (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            const fd = new FormData();
                            fd.set("id", r.id);
                            startTransition(async () => {
                              await removeWatchlistItemAction(fd);
                            });
                          }}
                          className="text-rose-400/90 hover:text-rose-300 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="panel w-full max-w-md p-5">
            <h2 className="mb-3 text-sm font-semibold text-white">Add to watchlist</h2>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                startTransition(async () => {
                  await addWatchlistItemAction(fd);
                  setOpen(false);
                });
              }}
            >
              <input
                name="ticker"
                required
                placeholder="Ticker"
                className="glass-input w-full px-3 py-2 text-sm uppercase outline-none"
              />
              <input
                name="analystTarget"
                placeholder="Analyst price target (optional)"
                className="glass-input w-full px-3 py-2 text-sm outline-none"
              />
              <textarea name="notes" placeholder="Notes" className="glass-input w-full px-3 py-2 text-sm outline-none" rows={2} />
              <select name="pitchId" className="glass-input w-full px-3 py-2 text-sm text-zinc-200">
                <option value="">Link pitch (optional)</option>
                {pitchOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.ticker}
                  </option>
                ))}
              </select>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setOpen(false)} className="text-xs text-zinc-400">
                  Cancel
                </button>
                <button type="submit" className="rounded-[8px] bg-[#8e0604] px-3 py-2 text-xs text-white">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
