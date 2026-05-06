"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export type OrderRow = {
  orderId: string;
  ticker: string;
  side: "BUY" | "SELL";
  quantity: number;
  fillPrice: number;
  status: string;
  timestamp: string;
};

type SortKey = "ticker" | "side" | "quantity" | "fillPrice" | "status" | "timestamp";

export function OrdersTableClient() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [tickerQ, setTickerQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "timestamp",
    dir: "desc",
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/schwab/orders?days=120");
        const json = (await res.json()) as { ok?: boolean; orders?: OrderRow[]; message?: string };
        if (!cancelled) {
          if (!res.ok || !json.ok) setErr(json.message ?? "Failed to load orders");
          else {
            setErr(null);
            setOrders(json.orders ?? []);
          }
        }
      } catch {
        if (!cancelled) setErr("Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    let rows = [...orders];
    const tq = tickerQ.trim().toUpperCase();
    if (tq) rows = rows.filter((r) => r.ticker.includes(tq));
    if (from) {
      const f = new Date(from).getTime();
      rows = rows.filter((r) => new Date(r.timestamp).getTime() >= f);
    }
    if (to) {
      const t = new Date(to).getTime() + 86400000;
      rows = rows.filter((r) => new Date(r.timestamp).getTime() < t);
    }
    const mul = sort.dir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (sort.key === "quantity" || sort.key === "fillPrice") {
        return (Number(av) - Number(bv)) * mul;
      }
      if (sort.key === "timestamp") {
        return (new Date(String(av)).getTime() - new Date(String(bv)).getTime()) * mul;
      }
      return String(av).localeCompare(String(bv)) * mul;
    });
    return rows;
  }, [orders, from, to, tickerQ, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" },
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="glass-input rounded-[8px] px-2 py-1.5 text-xs text-zinc-200"
        />
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="glass-input rounded-[8px] px-2 py-1.5 text-xs text-zinc-200"
        />
        <input
          value={tickerQ}
          onChange={(e) => setTickerQ(e.target.value.toUpperCase())}
          placeholder="Ticker"
          className="glass-input min-w-[100px] flex-1 rounded-[8px] px-2 py-1.5 text-xs uppercase text-zinc-200 placeholder:text-zinc-600"
        />
      </div>

      <section className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-xs">
            <thead className="bg-white/5 text-zinc-400">
              <tr>
                {(
                  [
                    ["ticker", "Ticker"],
                    ["side", "Side"],
                    ["quantity", "Qty"],
                    ["fillPrice", "Fill"],
                    ["status", "Status"],
                    ["timestamp", "Time"],
                  ] as const
                ).map(([key, label]) => (
                  <th key={key} className="px-3 py-2 text-left font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort(key)}
                      className={cn(
                        "inline-flex items-center gap-1 hover:text-white",
                        sort.key === key && "text-white",
                      )}
                    >
                      {label}
                      {sort.key === key ? (sort.dir === "asc" ? "↑" : "↓") : ""}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-zinc-500">
                    Loading orders…
                  </td>
                </tr>
              ) : err ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-rose-400">
                    {err}
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-zinc-500">
                    No orders found in the selected date range.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.orderId} className="odd:bg-white/[0.015] text-zinc-200">
                    <td className="px-3 py-2 font-semibold text-white">{r.ticker}</td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                          r.side === "BUY" ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300",
                        )}
                      >
                        {r.side}
                      </span>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{r.quantity.toLocaleString()}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {r.fillPrice.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                    </td>
                    <td className="px-3 py-2 text-zinc-400">{r.status}</td>
                    <td className="px-3 py-2 text-zinc-400">
                      {r.timestamp ? new Date(r.timestamp).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
