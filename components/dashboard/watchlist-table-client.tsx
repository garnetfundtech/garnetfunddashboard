"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { SchwabQuoteResponse } from "@/lib/schwab";
import type { WatchlistRow } from "@/lib/types";
import { addWatchlistItemAction, removeWatchlistItemAction } from "@/app/(dashboard)/watchlist/actions";
import type { UserRole } from "@/lib/types";
import { Plus, Search } from "lucide-react";
import { Highlight } from "@/components/dashboard/highlight";

function fmtUsd(n: number | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function parseTarget(raw: string | null): string {
  if (!raw) return "—";
  const num = parseFloat(raw.replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(num)) return raw;
  return num.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
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
  pitchOptions: { id: string; ticker: string; thesis: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
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

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = !q
      ? merged
      : merged.filter((r) => {
          const pitch = r.pitchId ? pitchOptions.find((p) => p.id === r.pitchId) : null;
          const hay = [
            r.ticker,
            r.adderName,
            String(r.analystTarget ?? ""),
            parseTarget(r.analystTarget),
            pitch?.ticker ?? "",
            pitch?.thesis ?? "",
            fmtUsd(r.price),
            fmtUsd(r.hi),
            fmtUsd(r.lo),
            r.pe != null ? r.pe.toFixed(1) : "",
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return hay.includes(q);
        });

    const m = [...base];
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
  }, [merged, sort, query, pitchOptions]);

  function toggle(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="glass-input flex h-[42px] min-w-[240px] flex-1 items-center gap-2 px-3">
          <Search className="h-4 w-4 shrink-0 text-zinc-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search watchlist by ticker or user…"
            className="w-full bg-transparent text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
          />
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-[42px] items-center gap-2 rounded-[10px] bg-[#8e0604] px-3 text-xs font-medium text-white hover:bg-[#a80705]"
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
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-zinc-500">
                    No tickers on the watchlist yet. Add one to start tracking.
                  </td>
                </tr>
              ) : (
                visible.map((r) => {
                  const pitch = r.pitchId ? pitchOptions.find((p) => p.id === r.pitchId) : null;
                  return (
                  <tr key={r.id} className="odd:bg-white/[0.015] text-zinc-200">
                    <td className="px-3 py-2 font-semibold text-white">
                      <Highlight text={r.ticker} query={query} />
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      <Highlight text={fmtUsd(r.price)} query={query} />
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      <Highlight text={fmtUsd(r.hi)} query={query} />
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      <Highlight text={fmtUsd(r.lo)} query={query} />
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      <Highlight text={r.pe != null && Number.isFinite(r.pe) ? r.pe.toFixed(1) : "—"} query={query} />
                    </td>
                    <td className="px-3 py-2 tabular-nums text-zinc-300">
                      <Highlight text={parseTarget(r.analystTarget)} query={query} />
                    </td>
                    <td className="px-3 py-2 text-zinc-400">
                      <Highlight text={r.adderName} query={query} />
                    </td>
                    <td className="px-3 py-2">
                      {pitch ? (
                        <Link
                          href="/pipeline"
                          className="underline decoration-[#f4c5c4]/50 text-[#f4c5c4] hover:text-white hover:decoration-white transition-colors"
                          title={pitch.thesis}
                        >
                          <Highlight text={pitch.ticker} query={query} />
                        </Link>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
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
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
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
                    {p.ticker}{p.thesis ? ` — ${p.thesis.slice(0, 40)}${p.thesis.length > 40 ? "…" : ""}` : ""}
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
